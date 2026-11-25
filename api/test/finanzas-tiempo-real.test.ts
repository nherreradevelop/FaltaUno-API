import { Observable } from '../src/comun/observable';
import type { EventoGasto } from '../src/modulos/gastos/gastos.eventos';
import type { EventoPago } from '../src/modulos/pagos/pagos.eventos';
import { FinanzasTiempoRealObservador } from '../src/modulos/gastos/finanzas-tiempo-real.observador';
import { conectarActualizacionesFinancieras } from '../src/suscripciones';

describe('CU23–CU26: Observer de actualización financiera', () => {
  it('avisa a los participantes sin enviar importes, partes ni identificadores de pagos', async () => {
    const emitirAUsuario = jest.fn();
    const participantes = jest.fn(async () => ['ana', 'bruno']);
    const observador = new FinanzasTiempoRealObservador({ participantes }, { emitirAUsuario });
    await observador.actualizar({ actividadId: 'actividad' });
    expect(participantes).toHaveBeenCalledWith('actividad');
    expect(emitirAUsuario.mock.calls).toEqual([
      ['ana', 'finanzas:actualizadas', { actividadId: 'actividad' }],
      ['bruno', 'finanzas:actualizadas', { actividadId: 'actividad' }],
    ]);
  });

  it('suscribe ambos dominios y los desconecta al cerrar', async () => {
    const alFallar = jest.fn();
    const gastos = new Observable<EventoGasto>(alFallar);
    const pagos = new Observable<EventoPago>(alFallar);
    const emitirAUsuario = jest.fn();
    const observador = new FinanzasTiempoRealObservador({ participantes: async () => ['ana'] }, { emitirAUsuario });
    const cerrar = conectarActualizacionesFinancieras(gastos, pagos, observador);
    const gasto: EventoGasto = { tipo: 'gastoEditado', actividadId: 'actividad', gastoId: 'g', usuarioId: 'ana' };
    const pago: EventoPago = { tipo: 'pagoEliminado', actividadId: 'actividad', pagoId: 'p', usuarioId: 'ana' };
    gastos.notificar(gasto);
    pagos.notificar(pago);
    await new Promise(setImmediate);
    expect(emitirAUsuario).toHaveBeenCalledTimes(2);
    cerrar();
    gastos.notificar(gasto);
    pagos.notificar(pago);
    await new Promise(setImmediate);
    expect(emitirAUsuario).toHaveBeenCalledTimes(2);
    expect(alFallar).not.toHaveBeenCalled();
  });
});
