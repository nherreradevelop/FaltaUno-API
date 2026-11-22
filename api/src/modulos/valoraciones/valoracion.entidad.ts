/** CU21 FP paso 5 y RN6: el puntaje es obligatorio, de 1 a 5 estrellas. */
export const PUNTAJE_MINIMO = 1;
export const PUNTAJE_MAXIMO = 5;
/** Largo máximo del comentario: el de la columna valoracion.comentario. */
export const LARGO_MAXIMO_COMENTARIO = 500;

/** Valoración que un participante le da a otro en una actividad (diagrama de clases). */
export class Valoracion {
  constructor(
    readonly actividadId: string,
    readonly evaluadorId: string,
    readonly evaluadoId: string,
    readonly puntaje: number,
    /** Opcional (RN6): null si el usuario no escribió nada. */
    readonly comentario: string | null,
  ) {}

  /** CU21 RN5: un usuario no puede valorarse a sí mismo. */
  esAutovaloracion(): boolean {
    return this.evaluadorId === this.evaluadoId;
  }
}
