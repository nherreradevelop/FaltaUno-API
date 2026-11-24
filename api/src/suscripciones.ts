import type { Observable } from './comun/observable';
import type { Logger } from './infra/logger';
import type { AuditoriaObservador } from './modulos/auditoria/auditoria.observador';
import type { EventoGasto } from './modulos/gastos/gastos.eventos';
import type { GastosNotificacionesObservador } from './modulos/gastos/gastos-notificaciones.observador';
import type { EventoPago } from './modulos/pagos/pagos.eventos';
import type { FinanzasTiempoRealObservador } from './modulos/gastos/finanzas-tiempo-real.observador';

/** Comparte la invalidación de vistas de gastos y pagos, sin convertirla en una notificación CU40. */
export function conectarActualizacionesFinancieras(
  gastos: Observable<EventoGasto>,
  pagos: Observable<EventoPago>,
  observador: FinanzasTiempoRealObservador,
): () => void {
  const alCambiar = (evento: { actividadId: string }) => observador.actualizar(evento);
  const desconectarGastos = gastos.suscribir(alCambiar);
  const desconectarPagos = pagos.suscribir(alCambiar);
  return () => {
    desconectarGastos();
    desconectarPagos();
  };
}

/** Único punto de suscripción de dominio. Devuelve la limpieza de listeners y del reintento de auditoría. */
export function conectarSuscripciones(
  eventos: Observable<EventoGasto>,
  auditoria: AuditoriaObservador,
  logger: Logger,
  notificaciones?: Pick<GastosNotificacionesObservador, 'entregar'>,
): () => void {
  let migracionAdvertida = false;
  let migracionNotificacionesAdvertida = false;
  async function entregar() {
    try {
      await auditoria.entregar();
    } catch (error) {
      // Permite desplegar el código antes de aplicar la migración 005, sin una advertencia por intervalo.
      if ((error as { code?: string }).code === '42P01') {
        if (!migracionAdvertida)
          logger.warn({ evento: 'gastos_migracion_pendiente' }, 'Aplicar migración 005 para habilitar gastos y auditoría.');
        migracionAdvertida = true;
      } else
        logger.error({ evento: 'auditoria_entrega_fallida', err: error }, 'Se reintentará la entrega de auditoría de gastos.');
    }
  }
  async function entregarNotificaciones() {
    if (!notificaciones) return;
    try {
      await notificaciones.entregar();
    } catch (error) {
      if ((error as { code?: string }).code === '42P01') {
        if (!migracionNotificacionesAdvertida)
          logger.warn(
            { evento: 'notificaciones_gastos_migracion_pendiente' },
            'Aplicar migración 006 para habilitar notificaciones de gastos.',
          );
        migracionNotificacionesAdvertida = true;
      } else
        logger.error(
          { evento: 'notificaciones_gastos_entrega_fallida', err: error },
          'Se reintentará la entrega de los avisos de gastos.',
        );
    }
  }
  const desuscribir = eventos.suscribir(entregar);
  const desuscribirNotificaciones = eventos.suscribir(entregarNotificaciones);
  const temporizador = setInterval(() => {
    void entregar();
    void entregarNotificaciones();
  }, 15_000);
  temporizador.unref();
  void entregar();
  void entregarNotificaciones();
  return () => {
    desuscribir();
    desuscribirNotificaciones();
    clearInterval(temporizador);
  };
}
