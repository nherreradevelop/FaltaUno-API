import type { Ejecutor } from '../../infra/postgres';

/** Acceso a la tabla valoracion. */
export class ValoracionesRepositorio {
  constructor(private readonly db: Ejecutor) {}

  /**
   * CU04 RN3: valoración promedio que recibió el usuario, redondeada a 2 decimales.
   * Devuelve null si todavía no tiene valoraciones. Se calcula en la base (índice ix_valoracion_evaluado)
   * para no traer todas las valoraciones a memoria.
   */
  async promedioRecibido(usuarioId: string): Promise<number | null> {
    // pg devuelve NUMERIC como texto para no perder precisión
    const resultado = await this.db.query<{ promedio: string | null }>(
      `SELECT ROUND(AVG(puntaje), 2) AS promedio FROM valoracion WHERE evaluado_id = $1`,
      [usuarioId],
    );
    const promedio = resultado.rows[0]?.promedio ?? null;
    return promedio === null ? null : Number(promedio);
  }
}
