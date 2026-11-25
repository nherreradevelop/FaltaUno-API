import type { Ejecutor } from '../../infra/postgres';

export class FinanzasTiempoRealRepositorio {
  constructor(private readonly db: Ejecutor) {}

  async participantes(actividadId: string): Promise<string[]> {
    const resultado = await this.db.query<{ usuario_id: string }>(
      `SELECT DISTINCT p.usuario_id FROM participacion p
       JOIN usuario u ON u.id=p.usuario_id
       WHERE p.actividad_id=$1 AND u.estado='activo'`,
      [actividadId],
    );
    return resultado.rows.map((fila) => fila.usuario_id);
  }
}
