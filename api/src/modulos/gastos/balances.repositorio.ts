import type { Ejecutor } from '../../infra/postgres';
import { aCentesimos, aDecimal, calcularBalances } from './gasto.entidad';

/** Una sola fuente de cálculo para gastos, pagos y pagos cuyo historial venció. */
export class BalancesRepositorio {
  constructor(private readonly db: Ejecutor) {}

  async calcular(actividadId: string, excluirPagoId?: string) {
    const r = await this.db.query<{ deudor: string; acreedor: string; monto: string }>(
      `WITH movimientos AS (
        SELECT pg.participacion_id AS deudor,g.pagado_por_id AS acreedor,pg.monto
        FROM parte_gasto pg JOIN gasto g ON g.id=pg.gasto_id
        WHERE g.actividad_id=$1 AND g.fecha_eliminacion IS NULL
        UNION ALL SELECT receptor_id,pagador_id,monto FROM pago
        WHERE actividad_id=$1 AND fecha_eliminacion IS NULL AND ($2::uuid IS NULL OR id<>$2)
        UNION ALL SELECT receptor_id,pagador_id,monto FROM pago_acumulado_archivado WHERE actividad_id=$1
      ), netos AS (
        SELECT LEAST(deudor,acreedor) AS menor,GREATEST(deudor,acreedor) AS mayor,
          sum(CASE WHEN deudor<acreedor THEN monto ELSE -monto END) AS monto
        FROM movimientos WHERE deudor<>acreedor GROUP BY 1,2
      ) SELECT CASE WHEN monto>0 THEN menor ELSE mayor END AS deudor,
        CASE WHEN monto>0 THEN mayor ELSE menor END AS acreedor,abs(monto)::text AS monto FROM netos WHERE monto<>0`,
      [actividadId, excluirPagoId ?? null],
    );
    return calcularBalances(
      r.rows.map((m) => ({
        deudorId: m.deudor,
        acreedorId: m.acreedor,
        montoCentesimos: aCentesimos(m.monto),
      })),
    );
  }

  async recalcular(actividadId: string): Promise<void> {
    const balances = await this.calcular(actividadId);
    await this.db.query('DELETE FROM balance WHERE actividad_id=$1', [actividadId]);
    if (!balances.length) return;
    await this.db.query(
      `INSERT INTO balance(actividad_id,deudor_id,acreedor_id,monto)
      SELECT $1,x.deudor,x.acreedor,x.monto FROM jsonb_to_recordset($2::jsonb) AS x(deudor uuid,acreedor uuid,monto numeric)`,
      [
        actividadId,
        JSON.stringify(
          balances.map((b) => ({
            deudor: b.deudorId,
            acreedor: b.acreedorId,
            monto: aDecimal(b.montoCentesimos),
          })),
        ),
      ],
    );
  }
}
