import type { Ejecutor } from '../../infra/postgres';
import { Deporte } from '../deportes/deporte.entidad';
import { Actividad, type EstadoActividad, type NivelActividad } from './actividad.entidad';

export type { EstadoActividad } from './actividad.entidad';

/** Datos de una actividad que se muestran en el historial del perfil (CU04 FP paso 2). */
export interface ActividadDelHistorial {
  id: string;
  nombre: string;
  deporte: string;
  fechaHoraInicio: Date;
  estado: EstadoActividad;
}

export interface PaginaDeHistorial {
  actividades: ActividadDelHistorial[];
  hayMas: boolean;
}

interface FilaHistorial {
  id: string;
  nombre: string;
  deporte: string;
  fecha_hora_inicio: Date;
  estado: EstadoActividad;
}

/** El historial muestra solo actividades terminadas: archivadas o canceladas, las haya organizado o no. */
const ESTADOS_DEL_HISTORIAL: EstadoActividad[] = ['archivada', 'cancelada'];

/** CU09 FP paso 2: datos del organizador que se muestran en el detalle. */
export interface OrganizadorDeActividad {
  id: string;
  nombre: string;
  fotoUrl: string | null;
}

/** CU09 FP paso 2: información ambiental disponible (la genera el flujo de n8n del CU15). */
export interface PronosticoDeActividad {
  resumen: string;
  /** null si el agente de IA no pudo interpretar las condiciones (CU15 E2 y ER4). */
  nivelRecomendado: NivelActividad | null;
  interpretacionDisponible: boolean;
  fechaGeneracion: Date;
}

/** CU09 FP pasos 2 y 3: la actividad, sus datos asociados y si el usuario que consulta participa. */
export interface DetalleDeActividad {
  actividad: Actividad;
  /** null si el organizador cerró su cuenta (CU33). */
  organizador: OrganizadorDeActividad | null;
  /** null si todavía no hay información ambiental. */
  pronostico: PronosticoDeActividad | null;
  participaElUsuario: boolean;
}

/** CU09 A1: un participante con los invitados externos que trae. */
export interface ParticipanteDeActividad {
  /** null si el usuario cerró su cuenta (CU33: "Usuario eliminado"). */
  usuario: { id: string; nombre: string; fotoUrl: string | null } | null;
  esOrganizador: boolean;
  invitadosExternos: string[];
}

export interface PaginaDeParticipantes {
  participantes: ParticipanteDeActividad[];
  hayMas: boolean;
}

interface FilaDetalle {
  id: string;
  nombre: string;
  deporte_id: number;
  deporte_nombre: string;
  estado: EstadoActividad;
  fecha_hora_inicio: Date;
  nivel: NivelActividad;
  descripcion: string | null;
  origen_direccion: string;
  origen_lat: string;
  origen_lng: string;
  destino_direccion: string;
  destino_lat: string;
  destino_lng: string;
  cupo_maximo: number;
  cupos_ocupados: string;
  costo_estimado: string | null;
  organizador_id: string | null;
  organizador_nombre: string | null;
  organizador_foto_url: string | null;
  pronostico_resumen: string | null;
  pronostico_nivel_recomendado: NivelActividad | null;
  pronostico_interpretacion_disponible: boolean | null;
  pronostico_fecha_generacion: Date | null;
  participa: boolean;
}

interface FilaParticipante {
  participacion_id: string;
  usuario_id: string | null;
  nombre: string | null;
  foto_url: string | null;
  es_organizador: boolean;
}

interface FilaInvitado {
  participacion_id: string;
  nombre: string;
}

/** Acceso a las tablas actividad y participacion. */
export class ActividadesRepositorio {
  constructor(private readonly db: Ejecutor) {}

  /**
   * CU04 FP paso 2: actividades en las que participó el usuario, de la más reciente a la más antigua.
   * Se pide una fila de más para saber si hay otra página sin hacer un COUNT. Usa ix_participacion_usuario.
   */
  async buscarHistorialDeParticipante(usuarioId: string, pagina: number, tamanoPagina: number): Promise<PaginaDeHistorial> {
    const desplazamiento = (pagina - 1) * tamanoPagina;
    const resultado = await this.db.query<FilaHistorial>(
      `SELECT a.id, a.nombre, d.nombre AS deporte, a.fecha_hora_inicio, a.estado
       FROM participacion p
       JOIN actividad a ON a.id = p.actividad_id
       JOIN deporte d ON d.id = a.deporte_id
       WHERE p.usuario_id = $1 AND a.estado = ANY($2)
       ORDER BY a.fecha_hora_inicio DESC, a.id DESC
       LIMIT $3 OFFSET $4`,
      [usuarioId, ESTADOS_DEL_HISTORIAL, tamanoPagina + 1, desplazamiento],
    );

    const hayMas = resultado.rows.length > tamanoPagina;
    const filasDeLaPagina = resultado.rows.slice(0, tamanoPagina);
    return { actividades: filasDeLaPagina.map(aActividadDelHistorial), hayMas };
  }

  /**
   * CU09 FP pasos 2 y 3: todo el detalle en una sola consulta.
   * Los cupos ocupados suman participaciones e invitados externos (usan ix_participacion_actividad e
   * ix_invitado_participacion). El organizador solo se muestra si su cuenta sigue activa.
   */
  async buscarDetalle(actividadId: string, usuarioId: string): Promise<DetalleDeActividad | null> {
    const resultado = await this.db.query<FilaDetalle>(
      `SELECT a.id, a.nombre, a.deporte_id, d.nombre AS deporte_nombre, a.estado, a.fecha_hora_inicio, a.nivel,
              a.descripcion, a.origen_direccion, a.origen_lat, a.origen_lng, a.destino_direccion, a.destino_lat,
              a.destino_lng, a.cupo_maximo, a.costo_estimado, a.organizador_id,
              o.nombre AS organizador_nombre, o.foto_url AS organizador_foto_url,
              ip.resumen AS pronostico_resumen, ip.nivel_recomendado AS pronostico_nivel_recomendado,
              ip.interpretacion_disponible AS pronostico_interpretacion_disponible,
              ip.fecha_generacion AS pronostico_fecha_generacion,
              (SELECT count(*) FROM participacion p WHERE p.actividad_id = a.id)
                + (SELECT count(*) FROM invitado_externo ie
                   JOIN participacion p ON p.id = ie.participacion_id
                   WHERE p.actividad_id = a.id) AS cupos_ocupados,
              EXISTS (SELECT 1 FROM participacion p WHERE p.actividad_id = a.id AND p.usuario_id = $2) AS participa
       FROM actividad a
       JOIN deporte d ON d.id = a.deporte_id
       LEFT JOIN usuario o ON o.id = a.organizador_id AND o.estado = 'activo'
       LEFT JOIN informe_pronostico ip ON ip.actividad_id = a.id
       WHERE a.id = $1`,
      [actividadId, usuarioId],
    );
    const fila = resultado.rows[0];
    return fila ? aDetalleDeActividad(fila) : null;
  }

  /** CU09 E2: si la actividad existe (para la lista de participantes). */
  async existe(actividadId: string): Promise<boolean> {
    const resultado = await this.db.query<{ existe: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM actividad WHERE id = $1) AS existe`,
      [actividadId],
    );
    return resultado.rows[0]?.existe ?? false;
  }

  /**
   * CU09 A1: participantes de la actividad (el organizador primero, después por orden de llegada), con sus
   * invitados externos. Dos consultas en total, sin importar el tamaño de la página: la de participaciones y
   * una sola para los invitados de toda la página (sin N+1).
   */
  async buscarParticipantes(actividadId: string, pagina: number, tamanoPagina: number): Promise<PaginaDeParticipantes> {
    const desplazamiento = (pagina - 1) * tamanoPagina;
    const resultado = await this.db.query<FilaParticipante>(
      `SELECT p.id AS participacion_id, u.id AS usuario_id, u.nombre, u.foto_url, p.es_organizador
       FROM participacion p
       LEFT JOIN usuario u ON u.id = p.usuario_id AND u.estado = 'activo'
       WHERE p.actividad_id = $1
       ORDER BY p.es_organizador DESC, p.fecha_union, p.id
       LIMIT $2 OFFSET $3`,
      [actividadId, tamanoPagina + 1, desplazamiento],
    );

    const hayMas = resultado.rows.length > tamanoPagina;
    const filasDeLaPagina = resultado.rows.slice(0, tamanoPagina);
    const invitadosPorParticipacion = await this.buscarInvitados(filasDeLaPagina.map((fila) => fila.participacion_id));

    const participantes = filasDeLaPagina.map((fila) => ({
      usuario: fila.usuario_id === null ? null : { id: fila.usuario_id, nombre: fila.nombre ?? '', fotoUrl: fila.foto_url },
      esOrganizador: fila.es_organizador,
      invitadosExternos: invitadosPorParticipacion.get(fila.participacion_id) ?? [],
    }));
    return { participantes, hayMas };
  }

  /** Invitados externos de varias participaciones en una sola consulta, agrupados por participación. */
  private async buscarInvitados(participacionIds: string[]): Promise<Map<string, string[]>> {
    const invitadosPorParticipacion = new Map<string, string[]>();
    if (participacionIds.length === 0) {
      return invitadosPorParticipacion;
    }

    const resultado = await this.db.query<FilaInvitado>(
      `SELECT participacion_id, nombre FROM invitado_externo
       WHERE participacion_id = ANY($1::uuid[])
       ORDER BY nombre, id`,
      [participacionIds],
    );
    for (const fila of resultado.rows) {
      const invitados = invitadosPorParticipacion.get(fila.participacion_id) ?? [];
      invitados.push(fila.nombre);
      invitadosPorParticipacion.set(fila.participacion_id, invitados);
    }
    return invitadosPorParticipacion;
  }

  /** CU04 A1: cantidad de actividades del historial (mismo criterio que buscarHistorialDeParticipante). */
  async contarHistorialDeParticipante(usuarioId: string): Promise<number> {
    // COUNT devuelve bigint, que pg entrega como texto
    const resultado = await this.db.query<{ cantidad: string }>(
      `SELECT count(*) AS cantidad
       FROM participacion p
       JOIN actividad a ON a.id = p.actividad_id
       WHERE p.usuario_id = $1 AND a.estado = ANY($2)`,
      [usuarioId, ESTADOS_DEL_HISTORIAL],
    );
    return Number(resultado.rows[0]?.cantidad ?? 0);
  }
}

function aActividadDelHistorial(fila: FilaHistorial): ActividadDelHistorial {
  return {
    id: fila.id,
    nombre: fila.nombre,
    deporte: fila.deporte,
    fechaHoraInicio: fila.fecha_hora_inicio,
    estado: fila.estado,
  };
}

/** pg devuelve NUMERIC como texto ("1200.50"); se pasa a centésimos sin usar decimales de punto flotante. */
export function aCentesimos(monto: string): number {
  const [enteros, decimales = ''] = monto.split('.');
  const centesimos = decimales.padEnd(2, '0').slice(0, 2);
  return Number(enteros) * 100 + Number(centesimos);
}

function aPronostico(fila: FilaDetalle): PronosticoDeActividad | null {
  if (fila.pronostico_resumen === null || fila.pronostico_fecha_generacion === null) {
    return null;
  }
  return {
    resumen: fila.pronostico_resumen,
    nivelRecomendado: fila.pronostico_nivel_recomendado,
    interpretacionDisponible: fila.pronostico_interpretacion_disponible ?? false,
    fechaGeneracion: fila.pronostico_fecha_generacion,
  };
}

function aOrganizador(fila: FilaDetalle): OrganizadorDeActividad | null {
  if (fila.organizador_id === null || fila.organizador_nombre === null) {
    return null;
  }
  return { id: fila.organizador_id, nombre: fila.organizador_nombre, fotoUrl: fila.organizador_foto_url };
}

function aDetalleDeActividad(fila: FilaDetalle): DetalleDeActividad {
  const actividad = new Actividad(
    fila.id,
    fila.nombre,
    new Deporte(fila.deporte_id, fila.deporte_nombre),
    fila.estado,
    fila.fecha_hora_inicio,
    fila.nivel,
    fila.descripcion,
    { direccion: fila.origen_direccion, lat: Number(fila.origen_lat), lng: Number(fila.origen_lng) },
    { direccion: fila.destino_direccion, lat: Number(fila.destino_lat), lng: Number(fila.destino_lng) },
    fila.cupo_maximo,
    Number(fila.cupos_ocupados), // count(*) es bigint: pg lo entrega como texto
    fila.organizador_id,
    fila.costo_estimado === null ? null : aCentesimos(fila.costo_estimado),
  );
  return {
    actividad,
    organizador: aOrganizador(fila),
    pronostico: aPronostico(fila),
    participaElUsuario: fila.participa,
  };
}
