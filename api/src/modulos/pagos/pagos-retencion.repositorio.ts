import type { Ejecutor } from '../../infra/postgres';

/** RNF-16: se ejecuta en una transacción corta, con el mismo bloqueo que las escrituras. */
export class PagosRetencionRepositorio {
  constructor(private readonly db: Ejecutor) {}

  async retirarHistorialVencido(): Promise<number> {
    const r = await this.db.query<{ id: string }>(
      `SELECT a.id FROM actividad a WHERE a.estado='archivada'
      AND a.fecha_archivado + interval '6 months'<=now()
      AND (EXISTS(SELECT 1 FROM pago p WHERE p.actividad_id=a.id)
        OR EXISTS(SELECT 1 FROM operacion_pago o WHERE o.actividad_id=a.id))
      ORDER BY a.fecha_archivado,a.id LIMIT 20 FOR UPDATE OF a SKIP LOCKED`,
    );
    if (!r.rows.length) return 0;
    const ids = r.rows.map((a) => a.id);
    await this.db.query(
      `INSERT INTO pago_acumulado_archivado(actividad_id,pagador_id,receptor_id,monto)
      SELECT actividad_id,pagador_id,receptor_id,sum(monto) FROM pago
      WHERE actividad_id=ANY($1::uuid[]) AND fecha_eliminacion IS NULL GROUP BY 1,2,3
      ON CONFLICT(actividad_id,pagador_id,receptor_id) DO UPDATE
      SET monto=pago_acumulado_archivado.monto+excluded.monto`,
      [ids],
    );
    await this.db.query('DELETE FROM operacion_pago WHERE actividad_id=ANY($1::uuid[])', [ids]);
    await this.db.query('DELETE FROM pago WHERE actividad_id=ANY($1::uuid[])', [ids]);
    return ids.length;
  }
}
