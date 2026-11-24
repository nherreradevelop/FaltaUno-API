import type { Logger } from './infra/logger';
import type { EventosDeActividades, ParticipanteUnido } from './modulos/actividades/actividades.eventos';
import type { ActividadesRepositorio } from './modulos/actividades/actividades.repositorio';
import { crearAvisoAlOrganizador, type Notificador } from './modulos/actividades/aviso-al-organizador';
import type { Observable } from './comun/observable';
import type { AuditoriaObservador } from './modulos/auditoria/auditoria.observador';
import type { EventoGasto } from './modulos/gastos/gastos.eventos';
import type { GastosNotificacionesObservador } from './modulos/gastos/gastos-notificaciones.observador';
import type { EventoPago } from './modulos/pagos/pagos.eventos';
import type { FinanzasTiempoRealObservador } from './modulos/gastos/finanzas-tiempo-real.observador';

/** Lo que necesitan los observadores. index.ts le pasa el contexto completo. */
interface DependenciasSuscripciones {
  eventosActividades: EventosDeActividades;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  actividades: Pick<ActividadesRepositorio, 'buscarDatosDelAviso'>;
  /** CU40: NotificacionesServicio. null mientras las notificaciones no estén disponibles. */
  notificador: Notificador | null;
}

/**
 * Único lugar donde se conectan los eventos de dominio con sus observadores (guía, sección 9).
 * Se llama una vez desde index.ts. Devuelve la función que desuscribe todo (la usan las pruebas).
 */
export function conectarSuscripciones(contexto: DependenciasSuscripciones): () => void {
  const { eventosActividades, logger, actividades, notificador } = contexto;

  const desuscripciones = [
    // CU11: deja rastro de cada incorporación para poder seguir el flujo en los logs
    eventosActividades.participanteUnido.suscribir((evento) => registrarParticipanteUnido(logger, evento)),
  ];

  if (notificador !== null) {
    // CU11 FP paso 9, RN13, RN14 y ER3: avisa al organizador por el CU40
    const avisoAlOrganizador = crearAvisoAlOrganizador({ actividades, notificador, logger });
    desuscripciones.push(eventosActividades.participanteUnido.suscribir(avisoAlOrganizador));
  }

  return () => desuscripciones.forEach((desuscribir) => desuscribir());
}

function registrarParticipanteUnido(logger: Pick<Logger, 'info'>, evento: ParticipanteUnido): void {
  logger.info({ evento: 'participante_unido', ...evento }, 'Un usuario se unió a una actividad');
}

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

/** CU23-CU25: auditoría y avisos de gastos. Devuelve la limpieza de listeners y del reintento de auditoría. */
export function conectarSuscripcionesDeGastos(
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
