import type { Db } from 'mongodb';
import type { Ejecutor } from '../../infra/postgres';

/** RNF-26: salida transaccional SQL → auditoría MongoDB, deduplicada por ID de evento. */
export class AuditoriaObservador {
  private entregando = false;
  constructor(
    private readonly db: Ejecutor,
    private readonly mongo: Db,
  ) {}

  async entregar(): Promise<void> {
    if (this.entregando) return;
    this.entregando = true;
    try {
      const r = await this.db.query<{ id: string; evento: Record<string, unknown> }>(
        'SELECT id,evento FROM auditoria_gasto_pendiente WHERE entregada IS NULL ORDER BY fecha LIMIT 100',
      );
      // Cada documento tiene su propio acuse; reentregar después de un corte no duplica la auditoría.
      if (!r.rows.length) return;
      await this.mongo.collection<{ _id: string; evento: Record<string, unknown> }>('auditoria').bulkWrite(
        r.rows.map((fila) => ({
          updateOne: { filter: { _id: fila.id }, update: { $setOnInsert: { evento: fila.evento } }, upsert: true },
        })),
      );
      await this.db.query('UPDATE auditoria_gasto_pendiente SET entregada=now() WHERE id=ANY($1::uuid[])', [
        r.rows.map((fila) => fila.id),
      ]);
    } finally {
      this.entregando = false;
    }
  }
}
