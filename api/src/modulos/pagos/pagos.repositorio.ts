import type { Ejecutor } from '../../infra/postgres';
import { aCentesimos, aDecimal } from '../gastos/gasto.entidad';
import { GastosRepositorio } from '../gastos/gastos.repositorio';
import { BalancesRepositorio } from '../gastos/balances.repositorio';
import type { PagoDto, ResultadoPago } from './pagos.dto';

interface FilaPago {
  id: string;
  actividad_id: string;
  pagador_id: string;
  receptor_id: string;
  registrado_por_id: string;
  monto: string;
  version: number;
  fecha_registro: Date;
  fecha_cursor: string;
  fecha_eliminacion: Date | null;
}
const columnas = `p.id,p.actividad_id,p.pagador_id,p.receptor_id,p.registrado_por_id,p.monto::text,p.version,
  p.fecha_registro,p.fecha_eliminacion,
  to_char(p.fecha_registro AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS fecha_cursor`;

/** CU26: SQL parametrizado; comparte permisos, auditoría y balances con gastos. */
export class PagosRepositorio {
  readonly gastos: GastosRepositorio;
  readonly balances: BalancesRepositorio;
  constructor(private readonly db: Ejecutor) {
    this.gastos = new GastosRepositorio(db);
    this.balances = new BalancesRepositorio(db);
  }

  async retencion(actividadId: string) {
    const r = await this.db.query<{ hasta: Date | null; vencido: boolean }>(
      `SELECT CASE WHEN estado='archivada' THEN fecha_archivado + interval '6 months' END AS hasta,
        COALESCE(estado='archivada' AND fecha_archivado + interval '6 months'<=now(),false) AS vencido
      FROM actividad WHERE id=$1`,
      [actividadId],
    );
    return r.rows[0];
  }

  async detalle(actividadId: string, pagoId: string): Promise<PagoDto | null> {
    const r = await this.db.query<FilaPago>(`SELECT ${columnas} FROM pago p WHERE p.actividad_id=$1 AND p.id=$2`, [
      actividadId,
      pagoId,
    ]);
    return r.rows[0] ? aPago(r.rows[0]) : null;
  }

  async listar(actividadId: string, participacionId: string, cursor?: { fecha: string; id: string }) {
    const r = await this.db.query<FilaPago>(
      `SELECT ${columnas} FROM pago p WHERE p.actividad_id=$1 AND p.fecha_eliminacion IS NULL
        AND (p.pagador_id=$2 OR p.receptor_id=$2)
        AND ($3::timestamptz IS NULL OR (p.fecha_registro,p.id)<($3::timestamptz,$4::uuid))
        ORDER BY p.fecha_registro DESC,p.id DESC LIMIT 21`,
      [actividadId, participacionId, cursor?.fecha ?? null, cursor?.id ?? null],
    );
    const ultima = r.rows.slice(0, 20).at(-1);
    return {
      pagos: r.rows.slice(0, 20).map(aPago),
      siguienteCursor:
        r.rows.length > 20 && ultima
          ? Buffer.from(JSON.stringify({ fecha: ultima.fecha_cursor, id: ultima.id })).toString('base64url')
          : null,
    };
  }

  async guardar(
    id: string,
    actividadId: string,
    autor: string,
    pagador: string,
    receptor: string,
    monto: number,
    crear: boolean,
  ) {
    if (crear)
      await this.db.query(
        `INSERT INTO pago(id,actividad_id,registrado_por_id,pagador_id,receptor_id,monto) VALUES($1,$2,$3,$4,$5,$6)`,
        [id, actividadId, autor, pagador, receptor, aDecimal(monto)],
      );
    else await this.db.query('UPDATE pago SET monto=$2,version=version+1 WHERE id=$1', [id, aDecimal(monto)]);
  }

  async eliminar(id: string) {
    await this.db.query('UPDATE pago SET fecha_eliminacion=now(),version=version+1 WHERE id=$1', [id]);
  }

  async bloquearOperacion(actividadId: string, usuarioId: string, clave: string) {
    await this.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`pagos:${actividadId}:${usuarioId}:${clave}`]);
  }
  async operacion(actividadId: string, usuarioId: string, clave: string) {
    const r = await this.db.query<{ huella: string; respuesta: ResultadoPago }>(
      'SELECT huella,respuesta FROM operacion_pago WHERE actividad_id=$1 AND usuario_id=$2 AND clave=$3',
      [actividadId, usuarioId, clave],
    );
    return r.rows[0] ?? null;
  }
  async confirmar(actividadId: string, usuarioId: string, clave: string, huella: string, resultado: ResultadoPago) {
    await this.db.query('INSERT INTO operacion_pago(actividad_id,usuario_id,clave,huella,respuesta) VALUES($1,$2,$3,$4,$5)', [
      actividadId,
      usuarioId,
      clave,
      huella,
      JSON.stringify(resultado),
    ]);
  }
}

function aPago(p: FilaPago): PagoDto {
  return {
    id: p.id,
    actividadId: p.actividad_id,
    pagadorId: p.pagador_id,
    receptorId: p.receptor_id,
    registradoPorId: p.registrado_por_id,
    montoCentesimos: aCentesimos(p.monto),
    version: p.version,
    fechaRegistro: p.fecha_registro.toISOString(),
    eliminado: p.fecha_eliminacion !== null,
  };
}
