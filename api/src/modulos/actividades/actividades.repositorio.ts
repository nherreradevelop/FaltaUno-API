import type { Ejecutor } from '../../infra/postgres';
import { Deporte } from '../deportes/deporte.entidad';
import {
  Actividad,
  FRANJAS_HORARIAS,
  ZONA_HORARIA,
  type EstadoActividad,
  type NivelActividad,
  type Ubicacion,
} from './actividad.entidad';
import {
  aActividadCreada,
  type ActividadCreadaDto,
  type DatosCrearActividad,
  type FiltrosDeBusqueda,
  type UbicacionActividad,
} from './actividades.dto';

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

/** CU08: organizador que se muestra en la tarjeta de la búsqueda, con su valoración promedio (CU04 RN3). */
export interface OrganizadorEncontrado {
  id: string;
  nombre: string;
  /** Promedio con 2 decimales, o null si todavía no tiene valoraciones. */
  valoracionPromedio: number | null;
}

/** CU08: una actividad de la búsqueda con su organizador. */
export interface ActividadEncontrada {
  actividad: Actividad;
  /** Datos declarados por el organizador; no representan disponibilidad de asientos. */
  tieneVehiculo: boolean;
  requiereVehiculo: boolean;
  /** null si el organizador cerró su cuenta (CU33). */
  organizador: OrganizadorEncontrado | null;
}

export interface PaginaDeActividades {
  actividades: ActividadEncontrada[];
  hayMas: boolean;
}

interface FilaActividadEncontrada {
  organizador_tiene_vehiculo: boolean;
  requiere_vehiculo: boolean;
  id: string;
  nombre: string;
  deporte_id: number;
  deporte_nombre: string;
  estado: EstadoActividad;
  fecha_hora_inicio: Date;
  nivel: NivelActividad;
  descripcion: string | null;
  // El origen es opcional (CU10): las tres columnas vienen juntas o las tres en null
  origen_direccion: string | null;
  origen_lat: string | null;
  origen_lng: string | null;
  destino_direccion: string;
  destino_lat: string;
  destino_lng: string;
  departamento: string;
  cupo_maximo: number;
  costo_estimado: string | null;
  organizador_id: string | null;
  organizador_nombre: string | null;
  organizador_valoracion: string | null; // NUMERIC, que pg entrega como texto
  cupos_ocupados: string; // count() devuelve bigint, que pg entrega como texto
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
  // El origen es opcional (CU10): las tres columnas vienen juntas o las tres en null
  origen_direccion: string | null;
  origen_lat: string | null;
  origen_lng: string | null;
  destino_direccion: string;
  destino_lat: string;
  destino_lng: string;
  departamento: string;
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
              a.destino_lng, a.departamento, a.cupo_maximo, a.costo_estimado, a.organizador_id,
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

  /**
   * CU08 – Buscar actividades programadas y futuras por sección, de a una página.
   * Las propias se conservan aunque estén completas; las demás requieren cupo disponible.
   * Los cupos ocupados se cuentan en la misma consulta (sin N+1), con el organizador y los invitados externos.
   * Se pide una fila de más para saber si hay otra página sin hacer un COUNT.
   */
  async buscarDisponibles(
    filtros: FiltrosDeBusqueda,
    pagina: number,
    tamanoPagina: number,
    usuarioId?: string,
  ): Promise<PaginaDeActividades> {
    const consulta = new ConsultaConFiltros();
    agregarFiltros(consulta, filtros, usuarioId);
    const orden = ordenDeLaBusqueda(consulta, filtros);
    const limite = consulta.parametro(tamanoPagina + 1);
    const desplazamiento = consulta.parametro((pagina - 1) * tamanoPagina);

    const resultado = await this.db.query<FilaActividadEncontrada>(
      `SELECT a.id, a.nombre, a.deporte_id, d.nombre AS deporte_nombre, a.estado, a.fecha_hora_inicio, a.nivel,
              a.descripcion, a.origen_direccion, a.origen_lat, a.origen_lng, a.destino_direccion, a.destino_lat,
              a.destino_lng, a.departamento, a.cupo_maximo, a.costo_estimado, a.organizador_id,
              a.organizador_tiene_vehiculo, a.requiere_vehiculo,
              o.nombre AS organizador_nombre, valoracion_organizador.promedio AS organizador_valoracion,
              ocupacion.cupos_ocupados
       FROM actividad a
       JOIN deporte d ON d.id = a.deporte_id
       LEFT JOIN usuario o ON o.id = a.organizador_id AND o.estado = 'activo'
       -- Valoración promedio del organizador (CU04 RN3), calculada en la misma consulta para no hacer una por actividad
       LEFT JOIN LATERAL (
         SELECT ROUND(AVG(v.puntaje), 2) AS promedio FROM valoracion v WHERE v.evaluado_id = a.organizador_id
       ) valoracion_organizador ON true
       CROSS JOIN LATERAL (
         SELECT (SELECT count(*) FROM participacion p WHERE p.actividad_id = a.id)
              + (SELECT count(*) FROM invitado_externo ie
                 JOIN participacion p ON p.id = ie.participacion_id
                 WHERE p.actividad_id = a.id) AS cupos_ocupados
       ) ocupacion
       WHERE ${consulta.condiciones.join('\n         AND ')}
       ORDER BY ${orden}
       LIMIT ${limite} OFFSET ${desplazamiento}`,
      consulta.parametros,
    );

    const hayMas = resultado.rows.length > tamanoPagina;
    const filasDeLaPagina = resultado.rows.slice(0, tamanoPagina);
    return { actividades: filasDeLaPagina.map(aActividadEncontrada), hayMas };
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

  // --- CU10 – Crear actividad ---

  async deportesActivos(): Promise<{ id: number; nombre: string }[]> {
    const resultado = await this.db.query<{ id: number; nombre: string }>(
      'SELECT id, nombre FROM deporte WHERE activo ORDER BY nombre',
    );
    return resultado.rows;
  }

  async cuentaActiva(usuarioId: string): Promise<boolean> {
    const resultado = await this.db.query('SELECT id FROM usuario WHERE id = $1 AND estado = $2 AND verificado FOR SHARE', [
      usuarioId,
      'activo',
    ]);
    return resultado.rows.length > 0;
  }

  /** Serializa los reintentos del mismo UUID sin tablas nuevas de idempotencia. */
  async bloquearAlta(id: string): Promise<void> {
    await this.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id]);
  }

  async buscarCreada(id: string, usuarioId: string): Promise<ActividadCreadaDto | null> {
    const resultado = await this.db.query<{
      id: string;
      nombre: string;
      cupo_maximo: number;
      cantidad: number;
      costo_centavos: string | null;
      destino_provisional: boolean;
    }>(
      `SELECT a.id, a.nombre, a.cupo_maximo, a.destino_provisional, (a.costo_estimado * 100)::bigint::text AS costo_centavos,
        (SELECT count(*)::integer FROM participacion p WHERE p.actividad_id = a.id) +
        (SELECT count(*)::integer FROM invitado_externo i JOIN participacion p ON p.id = i.participacion_id
          WHERE p.actividad_id = a.id) AS cantidad
       FROM actividad a WHERE a.id = $1 AND a.organizador_id = $2`,
      [id, usuarioId],
    );
    const fila = resultado.rows[0];
    if (!fila) return null;
    return aActividadCreada(
      fila.id,
      {
        nombre: fila.nombre,
        cupoMaximo: fila.cupo_maximo,
        invitados: Array.from({ length: fila.cantidad - 1 }, () => ''),
        costoEstimadoCentavos: fila.costo_centavos === null ? null : Number(fila.costo_centavos),
      },
      fila.destino_provisional,
    );
  }

  async crear(
    id: string,
    usuarioId: string,
    datos: DatosCrearActividad,
    origen: UbicacionActividad | null,
    destino: UbicacionActividad,
    destinoProvisional: boolean,
  ): Promise<void> {
    // Centésimos -> decimal exacto para NUMERIC, sin división de punto flotante.
    const costo = datos.costoEstimadoCentavos;
    const costoDecimal = costo === null ? null : `${Math.trunc(costo / 100)}.${String(costo % 100).padStart(2, '0')}`;
    await this.db.query(
      `INSERT INTO actividad (id, organizador_id, deporte_id, nombre, descripcion, fecha_hora_inicio, cupo_maximo, nivel,
        origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng, departamento,
        organizador_tiene_vehiculo, lugares_vehiculo, requiere_vehiculo, costo_estimado, destino_provisional, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'programada')`,
      [
        id,
        usuarioId,
        datos.deporteId,
        datos.nombre,
        datos.descripcion,
        datos.fechaHoraInicio,
        datos.cupoMaximo,
        datos.nivel,
        origen?.direccion ?? null,
        origen?.lat ?? null,
        origen?.lng ?? null,
        destino.direccion,
        destino.lat,
        destino.lng,
        destino.departamento,
        datos.tieneVehiculo,
        datos.lugaresVehiculo,
        datos.requiereVehiculo,
        costoDecimal,
        destinoProvisional,
      ],
    );
    const participacion = await this.db.query<{ id: string }>(
      `INSERT INTO participacion (actividad_id, usuario_id, es_organizador, tiene_vehiculo, lugares_vehiculo,
        punto_partida_direccion, punto_partida_lat, punto_partida_lng)
       VALUES ($1,$2,TRUE,$3,$4,$5,$6,$7) RETURNING id`,
      [
        id,
        usuarioId,
        datos.tieneVehiculo,
        datos.lugaresVehiculo,
        origen?.direccion ?? null,
        origen?.lat ?? null,
        origen?.lng ?? null,
      ],
    );
    if (datos.invitados.length > 0) {
      await this.db.query('INSERT INTO invitado_externo (participacion_id, nombre) SELECT $1, unnest($2::text[])', [
        participacion.rows[0].id,
        datos.invitados,
      ]);
    }
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
    aOrigen(fila),
    { direccion: fila.destino_direccion, lat: Number(fila.destino_lat), lng: Number(fila.destino_lng) },
    fila.departamento,
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

/** Sección del dashboard y filtros de búsqueda; las actividades propias no requieren cupo libre. */
function agregarFiltros(consulta: ConsultaConFiltros, filtros: FiltrosDeBusqueda, usuarioId?: string): void {
  // RN2 / RN7: programada y que todavía no empezó
  consulta.condiciones.push(`a.estado = 'programada'`, 'a.fecha_hora_inicio > now()');
  // RN3 / RN7: con cupo libre para descubrir actividades; las propias también se muestran completas.
  if (!filtros.grupo || filtros.grupo === 'otras') {
    consulta.condiciones.push('ocupacion.cupos_ocupados < a.cupo_maximo');
  }

  if (filtros.grupo) {
    if (!usuarioId) throw new Error('La búsqueda por grupo requiere el usuario autenticado.');
    const usuario = consulta.parametro(usuarioId);
    const participa = `EXISTS (SELECT 1 FROM participacion propia
      WHERE propia.actividad_id = a.id AND propia.usuario_id = ${usuario})`;
    if (filtros.grupo === 'gestionando') {
      consulta.condiciones.push(`a.organizador_id = ${usuario}`);
    } else {
      // El organizador también participa: se excluye explícitamente de las otras dos secciones.
      consulta.condiciones.push(`a.organizador_id IS DISTINCT FROM ${usuario}`);
      consulta.condiciones.push(filtros.grupo === 'unido' ? participa : `NOT ${participa}`);
    }
  }

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

function aActividadEncontrada(fila: FilaActividadEncontrada): ActividadEncontrada {
  const actividad = new Actividad(
    fila.id,
    fila.nombre,
    new Deporte(fila.deporte_id, fila.deporte_nombre),
    fila.estado,
    fila.fecha_hora_inicio,
    fila.nivel,
    fila.descripcion,
    aOrigen(fila),
    { direccion: fila.destino_direccion, lat: Number(fila.destino_lat), lng: Number(fila.destino_lng) },
    fila.departamento,
    fila.cupo_maximo,
    Number(fila.cupos_ocupados),
    fila.organizador_id,
    fila.costo_estimado === null ? null : aCentesimos(fila.costo_estimado),
  );
  return {
    actividad,
    organizador: aOrganizadorEncontrado(fila),
    tieneVehiculo: fila.organizador_tiene_vehiculo,
    requiereVehiculo: fila.requiere_vehiculo,
  };
}

function aOrganizadorEncontrado(fila: FilaActividadEncontrada): OrganizadorEncontrado | null {
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

/** El origen es opcional (CU10, ck_actividad_origen_completo): las tres columnas llegan juntas o ninguna. */
function aOrigen(fila: {
  origen_direccion: string | null;
  origen_lat: string | null;
  origen_lng: string | null;
}): Ubicacion | null {
  if (fila.origen_direccion === null || fila.origen_lat === null || fila.origen_lng === null) {
    return null;
  }
  return { direccion: fila.origen_direccion, lat: Number(fila.origen_lat), lng: Number(fila.origen_lng) };
}
