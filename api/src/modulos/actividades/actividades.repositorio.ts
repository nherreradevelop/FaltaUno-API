import type { Ejecutor } from '../../infra/postgres';
import { Deporte } from '../deportes/deporte.entidad';
import { Actividad, FRANJAS_HORARIAS, ZONA_HORARIA, type NivelActividad, type OrganizadorDeActividad } from './actividad.entidad';
import type { FiltrosDeBusqueda } from './actividades.dto';

export type EstadoActividad = 'programada' | 'iniciada' | 'archivada' | 'cancelada';

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

export interface PaginaDeActividades {
  actividades: Actividad[];
  hayMas: boolean;
}

interface FilaActividadEncontrada {
  id: string;
  nombre: string;
  deporte_id: number;
  deporte_nombre: string;
  fecha_hora_inicio: Date;
  departamento: string;
  nivel: NivelActividad;
  cupo_maximo: number;
  organizador_id: string | null;
  organizador_nombre: string | null;
  organizador_valoracion: string | null; // NUMERIC, que pg entrega como texto
  lugares_ocupados: string; // count() devuelve bigint, que pg entrega como texto
}

/** Junta las condiciones del WHERE y sus parámetros ($1, $2...) sin concatenar valores en el SQL. */
class ConsultaConFiltros {
  readonly condiciones: string[] = [];
  readonly parametros: unknown[] = [];

  /** Agrega el valor a los parámetros y devuelve su marcador ($n). */
  parametro(valor: unknown): string {
    this.parametros.push(valor);
    return `$${this.parametros.length}`;
  }
}

/** Fecha y hora de inicio en la hora de Uruguay (las fechas y franjas se eligen en hora local). */
const INICIO_EN_HORA_LOCAL = `(a.fecha_hora_inicio AT TIME ZONE '${ZONA_HORARIA}')`;

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

  /**
   * CU08 – Buscar actividades: disponibles (RN2, RN3, RN7) que cumplen todos los filtros (RN4), de a una página.
   * Los cupos ocupados se cuentan en la misma consulta (sin N+1), con el organizador y los invitados externos.
   * Se pide una fila de más para saber si hay otra página sin hacer un COUNT.
   */
  async buscarDisponibles(filtros: FiltrosDeBusqueda, pagina: number, tamanoPagina: number): Promise<PaginaDeActividades> {
    const consulta = new ConsultaConFiltros();
    agregarFiltros(consulta, filtros);
    const orden = ordenDeLaBusqueda(consulta, filtros);
    const limite = consulta.parametro(tamanoPagina + 1);
    const desplazamiento = consulta.parametro((pagina - 1) * tamanoPagina);

    const resultado = await this.db.query<FilaActividadEncontrada>(
      `SELECT a.id, a.nombre, a.deporte_id, d.nombre AS deporte_nombre, a.fecha_hora_inicio, a.departamento,
              a.nivel, a.cupo_maximo, a.organizador_id, u.nombre AS organizador_nombre,
              valoracion_organizador.promedio AS organizador_valoracion, ocupacion.lugares_ocupados
       FROM actividad a
       JOIN deporte d ON d.id = a.deporte_id
       LEFT JOIN usuario u ON u.id = a.organizador_id
       -- Valoración promedio del organizador (CU04 RN3), calculada en la misma consulta para no hacer una por actividad
       LEFT JOIN LATERAL (
         SELECT ROUND(AVG(v.puntaje), 2) AS promedio FROM valoracion v WHERE v.evaluado_id = a.organizador_id
       ) valoracion_organizador ON true
       CROSS JOIN LATERAL (
         SELECT (SELECT count(*) FROM participacion p WHERE p.actividad_id = a.id)
              + (SELECT count(*) FROM invitado_externo ie
                 JOIN participacion p ON p.id = ie.participacion_id
                 WHERE p.actividad_id = a.id) AS lugares_ocupados
       ) ocupacion
       WHERE ${consulta.condiciones.join('\n         AND ')}
       ORDER BY ${orden}
       LIMIT ${limite} OFFSET ${desplazamiento}`,
      consulta.parametros,
    );

    const hayMas = resultado.rows.length > tamanoPagina;
    const filasDeLaPagina = resultado.rows.slice(0, tamanoPagina);
    return { actividades: filasDeLaPagina.map(aActividad), hayMas };
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

/** RN2, RN3 y RN7 siempre; después, solo los filtros que eligió el usuario (A1 a A6). */
function agregarFiltros(consulta: ConsultaConFiltros, filtros: FiltrosDeBusqueda): void {
  // RN2 / RN7: programada y que todavía no empezó
  consulta.condiciones.push(`a.estado = 'programada'`, 'a.fecha_hora_inicio > now()');
  // RN3 / RN7: con al menos un cupo libre
  consulta.condiciones.push('ocupacion.lugares_ocupados < a.cupo_maximo');

  // RN5: dentro de cada filtro alcanza con cumplir uno de los valores elegidos
  if (filtros.deportes.length > 0) {
    consulta.condiciones.push(`a.deporte_id = ANY(${consulta.parametro(filtros.deportes)}::int[])`); // A1
  }
  if (filtros.departamentos.length > 0) {
    // A5 / RN6: el departamento donde se desarrolla la actividad
    consulta.condiciones.push(`a.departamento = ANY(${consulta.parametro(filtros.departamentos)}::text[])`);
  }
  if (filtros.niveles.length > 0) {
    consulta.condiciones.push(`a.nivel = ANY(${consulta.parametro(filtros.niveles)}::text[])`); // A6
  }
  if (filtros.desde) {
    consulta.condiciones.push(`${INICIO_EN_HORA_LOCAL}::date >= ${consulta.parametro(filtros.desde)}::date`); // A2
  }
  if (filtros.hasta) {
    consulta.condiciones.push(`${INICIO_EN_HORA_LOCAL}::date <= ${consulta.parametro(filtros.hasta)}::date`); // A2
  }
  if (filtros.cupoMaximo !== undefined) {
    consulta.condiciones.push(`a.cupo_maximo <= ${consulta.parametro(filtros.cupoMaximo)}`); // A3
  }
  if (filtros.franjas.length > 0) {
    consulta.condiciones.push(condicionDeFranjas(consulta, filtros)); // A4
  }
}

function condicionDeFranjas(consulta: ConsultaConFiltros, filtros: FiltrosDeBusqueda): string {
  const horaLocal = `EXTRACT(HOUR FROM ${INICIO_EN_HORA_LOCAL})`;
  const alternativas = filtros.franjas.map((franja) => {
    const { desdeHora, hastaHora } = FRANJAS_HORARIAS[franja];
    return `${horaLocal} BETWEEN ${consulta.parametro(desdeHora)} AND ${consulta.parametro(hastaHora)}`;
  });
  return `(${alternativas.join(' OR ')})`;
}

/**
 * RN1: primero por día (hora de Uruguay) y, dentro del mismo día, por cercanía del destino a la ubicación del usuario.
 * Sin ubicación (no dio permiso), solo por fecha y hora.
 */
function ordenDeLaBusqueda(consulta: ConsultaConFiltros, filtros: FiltrosDeBusqueda): string {
  if (!filtros.ubicacion) {
    return 'a.fecha_hora_inicio, a.id';
  }
  const lat = consulta.parametro(filtros.ubicacion.lat);
  const lng = consulta.parametro(filtros.ubicacion.lng);
  // Distancia en km por la fórmula de haversine (alcanza para ordenar; no hace falta PostGIS)
  const distanciaAlDestino = `6371 * 2 * asin(sqrt(
           power(sin(radians(a.destino_lat::float8 - ${lat}::float8) / 2), 2)
           + cos(radians(${lat}::float8)) * cos(radians(a.destino_lat::float8))
           * power(sin(radians(a.destino_lng::float8 - ${lng}::float8) / 2), 2)))`;
  return `${INICIO_EN_HORA_LOCAL}::date, ${distanciaAlDestino}, a.fecha_hora_inicio, a.id`;
}

function aActividad(fila: FilaActividadEncontrada): Actividad {
  return new Actividad(
    fila.id,
    fila.nombre,
    new Deporte(fila.deporte_id, fila.deporte_nombre),
    fila.fecha_hora_inicio,
    fila.departamento,
    fila.nivel,
    fila.cupo_maximo,
    Number(fila.lugares_ocupados),
    aOrganizador(fila),
  );
}

function aOrganizador(fila: FilaActividadEncontrada): OrganizadorDeActividad | null {
  if (fila.organizador_id === null || fila.organizador_nombre === null) {
    return null;
  }
  const valoracion = fila.organizador_valoracion;
  return {
    id: fila.organizador_id,
    nombre: fila.organizador_nombre,
    valoracionPromedio: valoracion === null ? null : Number(valoracion),
  };
}
