import type { Ejecutor } from '../../infra/postgres';

/** Valoraciones que recibió un usuario. */
export interface ResumenDeValoraciones {
  /** Promedio redondeado a 2 decimales, o null si todavía no tiene valoraciones. */
  promedio: number | null;
  cantidad: number;
}

/** Acceso a la tabla valoracion. */
export class ValoracionesRepositorio {
  constructor(private readonly db: Ejecutor) {}

  /**
   * CU04 RN3: promedio y cantidad de valoraciones que recibió el usuario, en una sola consulta.
   * Se calcula en la base (índice ix_valoracion_evaluado) para no traer todas las valoraciones a memoria.
   */
  async resumenRecibido(usuarioId: string): Promise<ResumenDeValoraciones> {
    // pg devuelve NUMERIC y bigint (COUNT) como texto para no perder precisión
    const resultado = await this.db.query<{ promedio: string | null; cantidad: string }>(
      `SELECT ROUND(AVG(puntaje), 2) AS promedio, count(*) AS cantidad FROM valoracion WHERE evaluado_id = $1`,
      [usuarioId],
    );
    const fila = resultado.rows[0];
    const promedio = fila?.promedio ?? null;
    return { promedio: promedio === null ? null : Number(promedio), cantidad: Number(fila?.cantidad ?? 0) };
  }
}
