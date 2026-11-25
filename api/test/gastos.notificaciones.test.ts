import type { PersonaGasto } from '../src/modulos/gastos/gasto.entidad';
import { destinatariosDeGasto } from '../src/modulos/gastos/gastos.notificaciones';
import { GastosNotificacionesObservador } from '../src/modulos/gastos/gastos-notificaciones.observador';
import type { Ejecutor } from '../src/infra/postgres';

const personas: PersonaGasto[] = [
  { id: 'p:a', participacionId: 'a', invitadoId: null, usuarioId: 'usuario-a', nombre: 'Ana', responsable: 'Ana' },
  { id: 'i:c', participacionId: 'a', invitadoId: 'c', usuarioId: 'usuario-a', nombre: 'Camila', responsable: 'Ana' },
  { id: 'p:b', participacionId: 'b', invitadoId: null, usuarioId: 'usuario-b', nombre: 'Bruno', responsable: 'Bruno' },
  { id: 'p:d', participacionId: 'd', invitadoId: null, usuarioId: null, nombre: 'Sin cuenta', responsable: 'Sin cuenta' },
];
describe('CU23–CU25 + CU40 – destinatarios de gastos', () => {
  it('paga un invitado: notifica al responsable y a los usuarios del reparto, sin duplicar roles', () => {
    expect(
      destinatariosDeGasto(
        {
          pagadorId: 'i:c',
          partes: [
            { personaId: 'p:a', participacionId: 'a', montoCentesimos: 10 },
            { personaId: 'i:c', participacionId: 'a', montoCentesimos: 10 },
            { personaId: 'p:b', participacionId: 'b', montoCentesimos: 10 },
          ],
        },
        personas,
      ).sort(),
    ).toEqual(['usuario-a', 'usuario-b']);
  });
  it('una parte cero no genera un cobro; el pagador sí recibe el aviso aunque no tenga parte', () => {
    expect(
      destinatariosDeGasto(
        { pagadorId: 'p:a', partes: [{ personaId: 'p:b', participacionId: 'b', montoCentesimos: 0 }] },
        personas,
      ),
    ).toEqual(['usuario-a']);
  });
  it('no inventa una dirección para una participación sin cuenta', () => {
    expect(
      destinatariosDeGasto(
        { pagadorId: 'p:d', partes: [{ personaId: 'p:d', participacionId: 'd', montoCentesimos: 100 }] },
        personas,
      ),
    ).toEqual([]);
  });
});

describe('Entrega durable de notificaciones de gastos', () => {
  const filas = [
    { id: 'entrega-a', actividad_id: 'actividad', usuario_id: 'usuario-a', tipo: 'gastoRegistrado', texto: 'Aviso de prueba' },
    { id: 'entrega-b', actividad_id: 'actividad', usuario_id: 'usuario-b', tipo: 'gastoRegistrado', texto: 'Aviso de prueba' },
  ];
  it('entrega mediante CU40 y acusa solo las entregas confirmadas', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: filas }).mockResolvedValue({ rows: [] });
    const notificar = jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('MongoDB caído'));
    const observador = new GastosNotificacionesObservador({ query } as unknown as Ejecutor, { notificar });
    await expect(observador.entregar()).rejects.toThrow('No se pudieron entregar');
    expect(notificar).toHaveBeenCalledWith('usuario-a', {
      tipo: 'gastoRegistrado',
      texto: 'Aviso de prueba',
      destino: { tipo: 'actividad', id: 'actividad' },
      claveEntrega: 'gasto:entrega-a',
    });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('SET notificada=now()'), [['entrega-a']]);
    query.mockResolvedValueOnce({ rows: [filas[1]] }).mockResolvedValueOnce({ rows: [] });
    notificar.mockResolvedValueOnce({});
    await observador.entregar();
    expect(notificar).toHaveBeenLastCalledWith('usuario-b', expect.objectContaining({ claveEntrega: 'gasto:entrega-b' }));
  });
  it('una caída al guardar el acuse conserva las mismas claves de entrega para reintentar', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [filas[0]] })
      .mockRejectedValueOnce(new Error('SQL sin acuse'));
    const notificar = jest.fn().mockResolvedValue({});
    const observador = new GastosNotificacionesObservador({ query } as unknown as Ejecutor, { notificar });
    await expect(observador.entregar()).rejects.toThrow('SQL sin acuse');
    query.mockResolvedValueOnce({ rows: [filas[0]] }).mockResolvedValueOnce({ rows: [] });
    await observador.entregar();
    expect(notificar.mock.calls[0]).toEqual(notificar.mock.calls[1]);
  });
  it('no solapa dos drenajes del mismo proceso y no llama al módulo si la cola está vacía', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const notificar = jest.fn();
    const observador = new GastosNotificacionesObservador({ query } as unknown as Ejecutor, { notificar });
    await Promise.all([observador.entregar(), observador.entregar()]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(notificar).not.toHaveBeenCalled();
  });
  it('mantiene el orden por usuario sin bloquear la entrega de otros usuarios', async () => {
    let liberar!: () => void;
    const barrera = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [filas[0], { ...filas[0], id: 'entrega-a2' }, filas[1]] })
      .mockResolvedValue({ rows: [] });
    const notificar = jest.fn().mockImplementation(async (_usuario: string, datos: { claveEntrega?: string }) => {
      if (datos.claveEntrega === 'gasto:entrega-a') await barrera;
      return {};
    });
    const observador = new GastosNotificacionesObservador({ query } as unknown as Ejecutor, { notificar });
    const resultado = observador.entregar();
    await new Promise((resolve) => setImmediate(resolve));
    expect(notificar.mock.calls.map((llamada) => llamada[1].claveEntrega)).toEqual(['gasto:entrega-a', 'gasto:entrega-b']);
    liberar();
    await resultado;
    expect(notificar).toHaveBeenLastCalledWith('usuario-a', expect.objectContaining({ claveEntrega: 'gasto:entrega-a2' }));
  });
});
