import { z } from 'zod';
import type { DestinoNotificacion, Notificacion, TipoNotificacion } from './notificacion.entidad';

// Un id de notificación es un ObjectId de MongoDB: 24 caracteres hexadecimales
const idNotificacion = z.string().regex(/^[0-9a-f]{24}$/i, 'Identificador de notificación inválido.');

/** GET /api/notificaciones?antesDe=<id>: "antesDe" es el id de la última notificación ya mostrada (A2). */
export const esquemaListar = z.object({ antesDe: idNotificacion.optional() });

export const esquemaIdNotificacion = z.object({ id: idNotificacion });

/** A1: "hasta" es el momento en que el usuario pidió marcar todas; las posteriores siguen sin leer. */
export const esquemaMarcarTodas = z.object({ hasta: z.string().datetime({ offset: true }) });

export interface NotificacionDto {
  id: string;
  tipo: TipoNotificacion;
  texto: string;
  destino: DestinoNotificacion | null;
  leida: boolean;
  /** ISO 8601 */
  creadaEn: string;
}

export interface PaginaNotificaciones {
  notificaciones: NotificacionDto[];
  hayMas: boolean;
}

export interface CantidadNoLeidas {
  cantidad: number;
}

export function aNotificacionDto(notificacion: Notificacion): NotificacionDto {
  return {
    id: notificacion.id,
    tipo: notificacion.tipo,
    texto: notificacion.texto,
    destino: notificacion.destino,
    leida: notificacion.leida,
    creadaEn: notificacion.creadaEn.toISOString(),
  };
}
