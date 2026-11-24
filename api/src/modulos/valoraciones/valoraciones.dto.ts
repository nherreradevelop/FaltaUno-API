import { z } from 'zod';
import { LARGO_MAXIMO_COMENTARIO, PUNTAJE_MAXIMO, PUNTAJE_MINIMO } from './valoracion.entidad';
import type { ParticipanteParaValorar } from './valoraciones.repositorio';

/** CU21 E1: mensaje cuando falta el puntaje o no está en el rango permitido. */
export const MENSAJE_PUNTAJE_INVALIDO = `Elegí un puntaje de ${PUNTAJE_MINIMO} a ${PUNTAJE_MAXIMO} estrellas.`;

/** PUT /api/actividades/:id/valoraciones/:usuarioId – CU21 FP pasos 5 a 7. */
export const esquemaValoracion = z.object({
  puntaje: z
    .number({ required_error: MENSAJE_PUNTAJE_INVALIDO, invalid_type_error: MENSAJE_PUNTAJE_INVALIDO })
    .int(MENSAJE_PUNTAJE_INVALIDO)
    .min(PUNTAJE_MINIMO, MENSAJE_PUNTAJE_INVALIDO)
    .max(PUNTAJE_MAXIMO, MENSAJE_PUNTAJE_INVALIDO),
  // RN6: el comentario es opcional; uno vacío o solo con espacios se guarda como null
  comentario: z
    .string({ invalid_type_error: 'El comentario tiene que ser un texto.' })
    .trim()
    .max(LARGO_MAXIMO_COMENTARIO, `El comentario puede tener hasta ${LARGO_MAXIMO_COMENTARIO} caracteres.`)
    .nullish()
    .transform((comentario) => (comentario ? comentario : null)),
});

export type DatosValoracion = z.infer<typeof esquemaValoracion>;

export const esquemaIdDeUsuario = z.string().uuid('El usuario no es válido.');

/** CU21 FP paso 2: los demás participantes; los que tienen miValoracion null están pendientes. */
export interface ParticipantesParaValorarDto {
  participantes: ParticipanteParaValorar[];
}

/** CU21 FP paso 10: la valoración que quedó registrada. */
export interface ValoracionGuardadaDto {
  valoracion: { puntaje: number; comentario: string | null };
}
