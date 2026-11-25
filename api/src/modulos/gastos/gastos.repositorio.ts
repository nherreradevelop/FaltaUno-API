import { BalancesRepositorio } from './balances.repositorio';
import type { Ejecutor } from '../../infra/postgres';
import { aCentesimos, aDecimal, type ParteGasto, type PersonaGasto } from './gasto.entidad';
import type { DatosGasto, GastoDto, ResultadoGasto } from './gastos.dto';
import type { EventoGasto } from './gastos.eventos';

interface FilaGasto {
  id: string;
  actividad_id: string;
  registrado_por_id: string;
  pagado_por_id: string;
  pagado_por_invitado_id: string | null;
  concepto: string;
  monto: string;
  version: number;
  fecha_registro: Date;
  fecha_cursor: string;
  fecha_eliminacion: Date | null;
  partes: { personaId: string; participacionId: string; monto: string }[];
}
const COLUMNAS_GASTO = `g.id, g.actividad_id, g.registrado_por_id, g.pagado_por_id, g.pagado_por_invitado_id,
  g.concepto, g.monto, g.version, g.fecha_registro, g.fecha_eliminacion,
  to_char(g.fecha_registro AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS fecha_cursor,
  COALESCE((SELECT json_agg(json_build_object('personaId', CASE WHEN pg.invitado_externo_id IS NULL
    THEN 'p:' || pg.participacion_id ELSE 'i:' || pg.invitado_externo_id END,
    'participacionId', pg.participacion_id, 'monto', pg.monto::text) ORDER BY pg.id)
    FROM parte_gasto pg WHERE pg.gasto_id=g.id), '[]'::json) AS partes`;

/** SQL del módulo. Todos los métodos reciben el mismo ejecutor cuando están en una transacción. */
export class GastosRepositorio {
  constructor(private readonly db: Ejecutor) {}

  async actividad(actividadId: string, usuarioId: string, bloquear: boolean) {
    const r = await this.db.query<{ estado: string; inicio: Date; participacion_id: string | null }>(
      `SELECT a.estado, a.fecha_hora_inicio AS inicio,
        (SELECT p.id FROM participacion p JOIN usuario u ON u.id=p.usuario_id AND u.estado='activo'
         WHERE p.actividad_id=a.id AND p.usuario_id=$2) AS participacion_id
       FROM actividad a WHERE a.id=$1 ${bloquear ? 'FOR UPDATE OF a' : ''}`,
      [actividadId, usuarioId],
    );
    return r.rows[0] ?? null;
  }

  async personas(actividadId: string): Promise<PersonaGasto[]> {
    const r = await this.db.query<PersonaGasto>(
      `SELECT 'p:' || p.id AS id, p.id AS "participacionId", NULL::uuid AS "invitadoId", p.usuario_id AS "usuarioId",
        COALESCE(u.nombre,'Participante sin cuenta') AS nombre, COALESCE(u.nombre,'Participante sin cuenta') AS responsable
       FROM participacion p LEFT JOIN usuario u ON u.id=p.usuario_id WHERE p.actividad_id=$1
       UNION ALL
       SELECT 'i:' || i.id, p.id, i.id, p.usuario_id, i.nombre, COALESCE(u.nombre,'Participante sin cuenta')
       FROM invitado_externo i JOIN participacion p ON p.id=i.participacion_id
       LEFT JOIN usuario u ON u.id=p.usuario_id WHERE p.actividad_id=$1 ORDER BY id`,
      [actividadId],
    );
    return r.rows;
  }

  async detalle(actividadId: string, gastoId: string): Promise<GastoDto | null> {
    const r = await this.db.query<FilaGasto>(`SELECT ${COLUMNAS_GASTO} FROM gasto g WHERE g.actividad_id=$1 AND g.id=$2`, [
      actividadId,
      gastoId,
    ]);
    return r.rows[0] ? aGasto(r.rows[0]) : null;
  }

  async listar(actividadId: string, cursor?: { fecha: string; id: string }) {
    const r = await this.db.query<FilaGasto>(
      `SELECT ${COLUMNAS_GASTO} FROM gasto g
      WHERE g.actividad_id=$1 AND g.fecha_eliminacion IS NULL
        AND ($2::timestamptz IS NULL OR (g.fecha_registro,g.id)<($2::timestamptz,$3::uuid))
      ORDER BY g.fecha_registro DESC,g.id DESC LIMIT 21`,
      [actividadId, cursor?.fecha ?? null, cursor?.id ?? null],
    );
    const pagina = r.rows.slice(0, 20).map(aGasto);
    const ultima = r.rows.slice(0, 20).at(-1);
    return {
      gastos: pagina,
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
    datos: DatosGasto,
    pagador: PersonaGasto,
    partes: ParteGasto[],
    crear: boolean,
  ): Promise<void> {
    if (crear) {
      await this.db.query(
        `INSERT INTO gasto(id,actividad_id,registrado_por_id,pagado_por_id,pagado_por_invitado_id,concepto,monto)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [id, actividadId, autor, pagador.participacionId, pagador.invitadoId, datos.concepto, aDecimal(datos.montoCentesimos)],
      );
    } else {
      await this.db.query(
        `UPDATE gasto SET concepto=$2,monto=$3,pagado_por_id=$4,pagado_por_invitado_id=$5,version=version+1 WHERE id=$1`,
        [id, datos.concepto, aDecimal(datos.montoCentesimos), pagador.participacionId, pagador.invitadoId],
      );
      await this.db.query('DELETE FROM parte_gasto WHERE gasto_id=$1', [id]);
    }
    await this.db.query(
      `INSERT INTO parte_gasto(gasto_id,participacion_id,invitado_externo_id,monto)
      SELECT $1, x.participacion_id, x.invitado_id, x.monto FROM jsonb_to_recordset($2::jsonb)
      AS x(participacion_id uuid,invitado_id uuid,monto numeric)`,
      [
        id,
        JSON.stringify(
          partes.map((p) => ({
            participacion_id: p.participacionId,
            invitado_id: p.personaId.startsWith('i:') ? p.personaId.slice(2) : null,
            monto: aDecimal(p.montoCentesimos),
          })),
        ),
      ],
    );
  }

  async eliminar(id: string): Promise<void> {
    await this.db.query('UPDATE gasto SET fecha_eliminacion=now(),version=version+1 WHERE id=$1', [id]);
  }

  async recalcular(actividadId: string): Promise<void> {
    await new BalancesRepositorio(this.db).recalcular(actividadId);
  }

  async balances(actividadId: string) {
    const r = await this.db.query<{ deudor_id: string; acreedor_id: string; monto: string }>(
      'SELECT deudor_id,acreedor_id,monto::text FROM balance WHERE actividad_id=$1 ORDER BY deudor_id,acreedor_id',
      [actividadId],
    );
    return r.rows.map((b) => ({ deudorId: b.deudor_id, acreedorId: b.acreedor_id, montoCentesimos: aCentesimos(b.monto) }));
  }

  async bloquearOperacion(actividadId: string, usuarioId: string, clave: string): Promise<void> {
    await this.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`gastos:${actividadId}:${usuarioId}:${clave}`]);
  }

  async operacion(actividadId: string, usuarioId: string, clave: string) {
    const r = await this.db.query<{ huella: string; respuesta: ResultadoGasto }>(
      'SELECT huella,respuesta FROM operacion_gasto WHERE actividad_id=$1 AND usuario_id=$2 AND clave=$3',
      [actividadId, usuarioId, clave],
    );
    return r.rows[0] ?? null;
  }

  async confirmarOperacion(
    actividadId: string,
    usuarioId: string,
    clave: string,
    huella: string,
    respuesta: ResultadoGasto,
  ): Promise<void> {
    await this.db.query('INSERT INTO operacion_gasto(actividad_id,usuario_id,clave,huella,respuesta) VALUES($1,$2,$3,$4,$5)', [
      actividadId,
      usuarioId,
      clave,
      huella,
      JSON.stringify(respuesta),
    ]);
  }

  async auditar(evento: Record<string, unknown>): Promise<void> {
    await this.db.query('INSERT INTO auditoria_gasto_pendiente(evento) VALUES($1)', [JSON.stringify(evento)]);
  }

  /** Se guarda en el mismo commit del gasto; un reintento nunca genera otro aviso de la misma versión. */
  async encolarNotificaciones(gasto: GastoDto, usuarios: string[], tipo: EventoGasto['tipo'], texto: string): Promise<void> {
    if (!usuarios.length) return;
    await this.db.query(
      `INSERT INTO notificacion_gasto_pendiente(actividad_id,gasto_id,version,usuario_id,tipo,texto)
      SELECT $1,$2,$3,usuario_id,$5,$6 FROM unnest($4::uuid[]) AS destinatario(usuario_id)
      ON CONFLICT (gasto_id,version,usuario_id) DO NOTHING`,
      [gasto.actividadId, gasto.id, gasto.version, usuarios, tipo, texto],
    );
  }
}

function aGasto(f: FilaGasto): GastoDto {
  return {
    id: f.id,
    actividadId: f.actividad_id,
    registradoPorId: f.registrado_por_id,
    concepto: f.concepto,
    montoCentesimos: aCentesimos(f.monto),
    pagadorId: f.pagado_por_invitado_id ? `i:${f.pagado_por_invitado_id}` : `p:${f.pagado_por_id}`,
    version: f.version,
    fechaRegistro: f.fecha_registro.toISOString(),
    eliminado: f.fecha_eliminacion !== null,
    partes: f.partes.map((p) => ({
      personaId: p.personaId,
      participacionId: p.participacionId,
      montoCentesimos: aCentesimos(p.monto),
    })),
  };
}
