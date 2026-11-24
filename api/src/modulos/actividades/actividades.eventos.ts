import { Observable } from '../../comun/observable';
import type { Logger } from '../../infra/logger';

/**
 * CU11 FP paso 9: un usuario se unió a una actividad.
 * Solo IDs y datos mínimos: cada observador busca lo que necesite.
 */
export interface ParticipanteUnido {
  actividadId: string;
  usuarioId: string;
  /** null si el organizador cerró su cuenta (CU33): no hay a quién avisarle. */
  organizadorId: string | null;
  /** CU11 FP paso 9: la notificación al organizador indica cuántos invitados externos trae. */
  cantidadInvitados: number;
}

/** Eventos de dominio del módulo de actividades. Los observadores se conectan en suscripciones.ts. */
export interface EventosDeActividades {
  participanteUnido: Observable<ParticipanteUnido>;
}

export function crearEventosDeActividades(logger: Pick<Logger, 'error'>): EventosDeActividades {
  return {
    // Un observador que falla no revierte la incorporación (CU11 RN15): solo se registra
    participanteUnido: new Observable<ParticipanteUnido>((error, evento) =>
      logger.error(
        {
          evento: 'observador_participante_unido_fallido',
          err: error,
          actividadId: evento.actividadId,
          usuarioId: evento.usuarioId,
        },
        'Falló un observador de participanteUnido',
      ),
    ),
  };
}
