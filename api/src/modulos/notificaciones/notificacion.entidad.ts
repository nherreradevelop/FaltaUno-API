/**
 * Avisos que generan los demás casos de uso (CU40 RN1). Cada tipo lo crea su caso de uso cuando exista:
 * Pendiente: CU06, CU12, CU13, CU17, CU21, CU29, CU31, CU32, CU36 y CU38.
 */
export const TIPOS_NOTIFICACION = [
  'solicitudAmistadRecibida', // Pendiente: CU06 – Gestionar lista de amigos
  'solicitudAmistadAceptada', // Pendiente: CU06
  'invitacionRecibida', // Pendiente: CU17 – Invitar a una actividad
  'participanteAbandono', // Pendiente: CU12 – Abandonar una actividad (aviso al organizador)
  'actividadCancelada', // Pendiente: CU13 – Cancelar una actividad
  'actividadEditada', // Pendiente: CU29 – Editar una actividad
  'actividadArchivada', // Pendiente: CU32 – Archivar actividad
  'participanteRemovido', // Pendiente: CU31 – Remover a un participante
  'valoracionPendiente', // Pendiente: CU21 – Valorar participantes
  'sugerenciaParticipantes', // Pendiente: CU36 – Falta Uno
  'invitadoSeUnio', // Pendiente: CU38 – Invitar al sistema
] as const;

export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];

/** A dónde lleva la notificación al seleccionarla (CU40 FP paso 7). Solo destinos que ya tienen pantalla. */
export type DestinoNotificacion = { tipo: 'actividad'; id: string } | { tipo: 'usuario'; id: string };

/** CU40: un aviso para un usuario. Se guarda en MongoDB (RN8). */
export class Notificacion {
  constructor(
    readonly id: string,
    readonly usuarioId: string,
    readonly tipo: TipoNotificacion,
    /** Texto ya armado por el caso de uso que la generó, sin datos sensibles (RN7). */
    readonly texto: string,
    readonly destino: DestinoNotificacion | null,
    readonly leida: boolean,
    readonly creadaEn: Date,
  ) {}

  /** RN6: cada usuario ve únicamente sus propias notificaciones. */
  perteneceA(usuarioId: string): boolean {
    return this.usuarioId === usuarioId;
  }
}
