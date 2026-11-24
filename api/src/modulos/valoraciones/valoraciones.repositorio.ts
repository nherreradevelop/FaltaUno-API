import type { Ejecutor } from '../../infra/postgres';
import type { EstadoActividad } from '../actividades/actividad.entidad';
import type { Valoracion } from './valoracion.entidad';

/** Valoraciones que recibió un usuario. */
export interface ResumenDeValoraciones {
  /** Promedio redondeado a 2 decimales, o null si todavía no tiene valoraciones. */
  promedio: number | null;
  cantidad: number;
}

/** CU21 FP paso 1: lo que hace falta saber de la actividad para decidir si el usuario puede valorar. */
export interface ActividadParaValorar {
  estado: EstadoActividad;
  /** Si el usuario que valora participó (como organizador o participante). */
  participa: boolean;
}

/** CU21 FP paso 2: otro participante de la actividad, con la valoración que ya le dio el usuario (null si está pendiente). */
export interface ParticipanteParaValorar {
  usuario: { id: string; nombre: string; fotoUrl: string | null };
  esOrganizador: boolean;
  miValoracion: { puntaje: number; comentario: string | null } | null;
}

interface FilaParticipanteParaValorar {
  usuario_id: string;
  nombre: string;
  foto_url: string | null;
  es_organizador: boolean;
  puntaje: number | null;
  comentario: string | null;
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

  /** CU21 FP paso 1 y E2: estado de la actividad y si el usuario participó, en una sola consulta; null si no existe. */
  async buscarActividadParaValorar(actividadId: string, usuarioId: string): Promise<ActividadParaValorar | null> {
    const resultado = await this.db.query<{ estado: EstadoActividad; participa: boolean }>(
      `SELECT a.estado,
              EXISTS (SELECT 1 FROM participacion p WHERE p.actividad_id = a.id AND p.usuario_id = $2) AS participa
       FROM actividad a
       WHERE a.id = $1`,
      [actividadId, usuarioId],
    );
    const fila = resultado.rows[0];
    return fila ? { estado: fila.estado, participa: fila.participa } : null;
  }

  /** CU21 RN1: si el usuario participó de la actividad. */
  async participo(actividadId: string, usuarioId: string): Promise<boolean> {
    const resultado = await this.db.query<{ participo: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM participacion WHERE actividad_id = $1 AND usuario_id = $2) AS participo`,
      [actividadId, usuarioId],
    );
    return resultado.rows[0]?.participo ?? false;
  }

  /**
   * CU21 FP paso 2: los demás participantes (cuentas activas) con la valoración que ya les dio el usuario, en una sola
   * consulta (sin N+1). No se pagina: la lista tiene como mucho el cupo máximo de la actividad.
   * Usa ix_participacion_actividad y uk_valoracion.
   */
  async buscarParticipantesParaValorar(actividadId: string, evaluadorId: string): Promise<ParticipanteParaValorar[]> {
    const resultado = await this.db.query<FilaParticipanteParaValorar>(
      `SELECT u.id AS usuario_id, u.nombre, u.foto_url, p.es_organizador, v.puntaje, v.comentario
       FROM participacion p
       JOIN usuario u ON u.id = p.usuario_id AND u.estado = 'activo'
       LEFT JOIN valoracion v ON v.actividad_id = p.actividad_id AND v.evaluador_id = $2 AND v.evaluado_id = u.id
       WHERE p.actividad_id = $1 AND p.usuario_id <> $2
       ORDER BY p.es_organizador DESC, p.fecha_union, p.id`,
      [actividadId, evaluadorId],
    );
    return resultado.rows.map(aParticipanteParaValorar);
  }

  /**
   * CU21 FP paso 8, A2 y RN2: guarda la valoración. Si el usuario ya había valorado a ese participante en esta
   * actividad, la reemplaza (índice único uk_valoracion). Al ser una sola sentencia, reintentarla no duplica (RNF-10).
   */
  async guardar(valoracion: Valoracion): Promise<void> {
    await this.db.query(
      `INSERT INTO valoracion (actividad_id, evaluador_id, evaluado_id, puntaje, comentario)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (actividad_id, evaluador_id, evaluado_id) WHERE evaluador_id IS NOT NULL
       DO UPDATE SET puntaje = EXCLUDED.puntaje, comentario = EXCLUDED.comentario, fecha = now()`,
      [valoracion.actividadId, valoracion.evaluadorId, valoracion.evaluadoId, valoracion.puntaje, valoracion.comentario],
    );
  }
}

function aParticipanteParaValorar(fila: FilaParticipanteParaValorar): ParticipanteParaValorar {
  // Sin puntaje: el usuario todavía no lo valoró (pendiente, A1)
  let miValoracion: ParticipanteParaValorar['miValoracion'] = null;
  if (fila.puntaje !== null) {
    miValoracion = { puntaje: fila.puntaje, comentario: fila.comentario };
  }
  return {
    usuario: { id: fila.usuario_id, nombre: fila.nombre, fotoUrl: fila.foto_url },
    esOrganizador: fila.es_organizador,
    miValoracion,
  };
}
