import type { Db } from 'mongodb';
import type { Ejecutor } from '../src/infra/postgres';
import { AuditoriaObservador } from '../src/modulos/auditoria/auditoria.observador';
import { Observable } from '../src/comun/observable';
import { conectarSuscripciones } from '../src/suscripciones';
import type { EventoGasto } from '../src/modulos/gastos/gastos.eventos';
import { logger } from '../src/infra/logger';

describe('CU25 RNF-26 – auditoría de gastos', () => {
  const evento = { tipo: 'gastoEliminado', usuarioId: 'usuario', gastoId: 'gasto', actividadId: 'actividad' };
  function preparar() {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'evento-1', evento }] })
      .mockResolvedValue({ rows: [] });
    const bulkWrite = jest.fn().mockResolvedValue({});
    const mongo = { collection: jest.fn().mockReturnValue({ bulkWrite }) } as unknown as Db;
    return { query, bulkWrite, observador: new AuditoriaObservador({ query } as unknown as Ejecutor, mongo) };
  }
  it('entrega por ID y marca el acuse después de MongoDB', async () => {
    const { query, bulkWrite, observador } = preparar();
    await observador.entregar();
    expect(bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: 'evento-1' }, update: { $setOnInsert: { evento } }, upsert: true } },
    ]);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('SET entregada=now()'), [['evento-1']]);
    expect(bulkWrite.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[1]);
  });
  it('fallo de MongoDB mantiene el evento pendiente para su reentrega', async () => {
    const { query, bulkWrite, observador } = preparar();
    bulkWrite.mockRejectedValueOnce(new Error('Mongo no disponible'));
    await expect(observador.entregar()).rejects.toThrow('Mongo no disponible');
    expect(query).toHaveBeenCalledTimes(1);
    query.mockResolvedValueOnce({ rows: [{ id: 'evento-1', evento }] }).mockResolvedValueOnce({ rows: [] });
    await observador.entregar();
    expect(bulkWrite).toHaveBeenCalledTimes(2);
  });
  it('sin pendientes no escribe MongoDB', async () => {
    const { query, bulkWrite, observador } = preparar();
    query.mockReset().mockResolvedValue({ rows: [] });
    await observador.entregar();
    expect(bulkWrite).not.toHaveBeenCalled();
  });
  it('Observer aísla fallos y permite desuscripción', async () => {
    const fallo = jest.fn();
    const observable = new Observable<number>(fallo);
    const recibido = jest.fn();
    const salir = observable.suscribir(recibido);
    observable.suscribir(() => {
      throw new Error('fallo');
    });
    observable.notificar(1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(recibido).toHaveBeenCalledWith(1);
    expect(fallo).toHaveBeenCalledTimes(1);
    salir();
    observable.notificar(2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(recibido).toHaveBeenCalledTimes(1);
  });
  it('suscripciones: reintenta pendientes y libera intervalo y observador', async () => {
    jest.useFakeTimers();
    const eventos = new Observable<EventoGasto>(() => undefined);
    const entregar = jest.fn().mockResolvedValue(undefined);
    const salir = conectarSuscripciones(eventos, { entregar } as unknown as AuditoriaObservador, logger);
    expect(entregar).toHaveBeenCalledTimes(1);
    eventos.notificar(evento as EventoGasto);
    await Promise.resolve();
    expect(entregar).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(15000);
    expect(entregar).toHaveBeenCalledTimes(3);
    salir();
    await jest.advanceTimersByTimeAsync(15000);
    eventos.notificar(evento as EventoGasto);
    await Promise.resolve();
    expect(entregar).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });
  it('un fallo de auditoría no impide los avisos; la limpieza detiene ambos observadores', async () => {
    jest.useFakeTimers();
    const eventos = new Observable<EventoGasto>(() => undefined);
    const auditoria = { entregar: jest.fn().mockRejectedValue(new Error('Auditoría indisponible')) };
    const notificaciones = { entregar: jest.fn().mockResolvedValue(undefined) };
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const salir = conectarSuscripciones(eventos, auditoria as unknown as AuditoriaObservador, logger, notificaciones);
    try {
      await jest.advanceTimersByTimeAsync(0);
      expect(notificaciones.entregar).toHaveBeenCalledTimes(1);
      eventos.notificar(evento as EventoGasto);
      await jest.advanceTimersByTimeAsync(0);
      expect(notificaciones.entregar).toHaveBeenCalledTimes(2);
      salir();
      await jest.advanceTimersByTimeAsync(15000);
      eventos.notificar(evento as EventoGasto);
      await jest.advanceTimersByTimeAsync(0);
      expect(notificaciones.entregar).toHaveBeenCalledTimes(2);
    } finally {
      salir();
      error.mockRestore();
      jest.useRealTimers();
    }
  });
});
