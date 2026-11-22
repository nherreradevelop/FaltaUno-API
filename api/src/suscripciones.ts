import type { Logger } from './infra/logger';
import type { EventosDeActividades, ParticipanteUnido } from './modulos/actividades/actividades.eventos';
import type { ActividadesRepositorio } from './modulos/actividades/actividades.repositorio';
import { crearAvisoAlOrganizador, type Notificador } from './modulos/actividades/aviso-al-organizador';

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
