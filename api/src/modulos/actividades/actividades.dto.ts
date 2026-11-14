import { z } from 'zod';
import {
  FRANJAS_HORARIAS,
  NIVELES_ACTIVIDAD,
  type EstadoActividad,
  type FranjaHoraria,
  type NivelActividad,
  type OpcionDeActividad,
  type RolEnActividad,
  type Ubicacion,
} from './actividad.entidad';
import type {
  ActividadEncontrada,
  DetalleDeActividad,
  PaginaDeParticipantes,
  ParticipanteDeActividad,
} from './actividades.repositorio';

/** CU08: la búsqueda se muestra de a 10 actividades. */
export const TAMANO_PAGINA_BUSQUEDA = 10;

/** CU08 A5: opciones del filtro de ubicación. El departamento de cada actividad se calcula a partir del mapa (CU10). */
export const DEPARTAMENTOS = [
  'Artigas',
  'Canelones',
  'Cerro Largo',
  'Colonia',
  'Durazno',
  'Flores',
  'Florida',
  'Lavalleja',
  'Maldonado',
  'Montevideo',
  'Paysandú',
  'Río Negro',
  'Rivera',
  'Rocha',
  'Salto',
  'San José',
  'Soriano',
  'Tacuarembó',
  'Treinta y Tres',
] as const;

/** "1,3" → ["1", "3"]. Los filtros con varios valores (RN5) llegan separados por coma en la URL. */
const listaSeparadaPorComas = z
  .string()
  .optional()
  .transform((valor) =>
    valor
      ? valor
          .split(',')
          .map((parte) => parte.trim())
          .filter(Boolean)
      : [],
  );

const fechaSinHora = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha tiene que tener el formato AAAA-MM-DD.')
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), 'La fecha no es válida.')
  .optional();

/** CU08 FP, A1 a A6: filtros de la búsqueda (query string). Todos son opcionales y se combinan (RN4). */
export const esquemaBusqueda = z
  .object({
    grupo: z.enum(['gestionando', 'unido', 'otras']).optional(),
    deportes: listaSeparadaPorComas.pipe(
      z.array(z.coerce.number({ invalid_type_error: 'Los deportes tienen que ser números.' }).int().positive()),
    ),
    departamentos: listaSeparadaPorComas.pipe(z.array(z.enum(DEPARTAMENTOS, { message: 'Departamento inválido.' }))),
    niveles: listaSeparadaPorComas.pipe(z.array(z.enum(NIVELES_ACTIVIDAD as [NivelActividad, ...NivelActividad[]]))),
    franjas: listaSeparadaPorComas.pipe(
      z.array(
        z.enum(Object.keys(FRANJAS_HORARIAS) as [FranjaHoraria, ...FranjaHoraria[]], { message: 'Franja horaria inválida.' }),
      ),
    ),
    desde: fechaSinHora,
    hasta: fechaSinHora,
    cupoMaximo: z.coerce
      .number({ invalid_type_error: 'La cantidad de personas tiene que ser un número.' })
      .int('La cantidad de personas tiene que ser un número entero.')
      .min(1, 'La cantidad de personas tiene que ser al menos 1.')
      .optional(),
    // Ubicación del usuario (GPS o navegador), solo para ordenar por cercanía (RN1). Si no dio permiso, no se envía.
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    pagina: z.coerce.number().int().min(1, 'La página empieza en 1.').default(1),
  })
  .superRefine((datos, contexto) => {
    if ((datos.lat === undefined) !== (datos.lng === undefined)) {
      contexto.addIssue({ code: 'custom', path: ['lat'], message: 'La ubicación necesita latitud y longitud.' });
    }
    if (datos.desde && datos.hasta && datos.desde > datos.hasta) {
      contexto.addIssue({ code: 'custom', path: ['hasta'], message: 'La fecha "hasta" no puede ser anterior a "desde".' });
    }
  });

export type DatosBusqueda = z.infer<typeof esquemaBusqueda>;

/** Filtros ya validados que recibe el repositorio. Una lista vacía significa "sin ese filtro". */
export interface FiltrosDeBusqueda {
  /** Sección del dashboard; si se omite, conserva la búsqueda general de disponibles. */
  grupo?: 'gestionando' | 'unido' | 'otras';
  deportes: number[];
  departamentos: string[];
  niveles: NivelActividad[];
  franjas: FranjaHoraria[];
  desde?: string;
  hasta?: string;
  cupoMaximo?: number;
  ubicacion?: { lat: number; lng: number };
}

export function aFiltrosDeBusqueda(datos: DatosBusqueda): FiltrosDeBusqueda {
  const tieneUbicacion = datos.lat !== undefined && datos.lng !== undefined;
  return {
    ...(datos.grupo ? { grupo: datos.grupo } : {}),
    deportes: datos.deportes,
    departamentos: datos.departamentos,
    niveles: datos.niveles,
    franjas: datos.franjas,
    desde: datos.desde,
    hasta: datos.hasta,
    cupoMaximo: datos.cupoMaximo,
    ubicacion: tieneUbicacion ? { lat: datos.lat!, lng: datos.lng! } : undefined,
  };
}

/** Lo que se muestra de cada actividad en la búsqueda (definido por el equipo). */
export interface ActividadEncontradaDto {
  id: string;
  nombre: string;
  deporte: { id: number; nombre: string };
  fechaHoraInicio: string;
  departamento: string;
  nivel: NivelActividad;
  cuposLibres: number;
  /** El organizador declaró que tiene vehículo; no garantiza asientos disponibles. */
  tieneVehiculo: boolean;
  /** El organizador marcó «Buscando traslado» al crear la actividad. */
  requiereVehiculo: boolean;
  /** Quién la organiza y su valoración promedio; null si el organizador cerró su cuenta. */
  organizador: { id: string; nombre: string; valoracionPromedio: number | null } | null;
  /** El cliente muestra "Organizada por ti". */
  esOrganizador: boolean;
}

export interface ResultadoDeBusquedaDto {
  actividades: ActividadEncontradaDto[];
  pagina: number;
  hayMas: boolean;
}

export function aActividadEncontradaDto(encontrada: ActividadEncontrada, usuarioId: string): ActividadEncontradaDto {
  const { actividad, organizador } = encontrada;
  return {
    id: actividad.id,
    nombre: actividad.nombre,
    deporte: { id: actividad.deporte.id, nombre: actividad.deporte.nombre },
    fechaHoraInicio: actividad.fechaHoraInicio.toISOString(),
    departamento: actividad.departamento,
    nivel: actividad.nivel,
    cuposLibres: actividad.cuposLibres(),
    tieneVehiculo: encontrada.tieneVehiculo,
    requiereVehiculo: encontrada.requiereVehiculo,
    organizador:
      organizador === null
        ? null
        : { id: organizador.id, nombre: organizador.nombre, valoracionPromedio: organizador.valoracionPromedio },
    esOrganizador: actividad.organizadorId === usuarioId,
  };
}

/** CU09 A1: la lista de participantes se pide de a 20 (valor técnico, no de negocio). */
export const TAMANO_PAGINA_PARTICIPANTES = 20;

/** CU09: id de la actividad que se consulta. */
export const esquemaIdDeActividad = z.string().uuid();

/** CU09 A1: página de la lista de participantes (query ?pagina=N, empieza en 1). */
export const esquemaPaginaParticipantes = z.object({
  pagina: z.coerce
    .number({ invalid_type_error: 'La página tiene que ser un número.' })
    .int('La página tiene que ser un número entero.')
    .min(1, 'La página empieza en 1.')
    .default(1),
});

export interface PronosticoDto {
  resumen: string;
  nivelRecomendado: NivelActividad | null;
  interpretacionDisponible: boolean;
  fechaGeneracion: string;
}

/** CU09 FP: detalle completo de la actividad, el rol del usuario y las opciones que le corresponden. */
export interface DetalleActividadDto {
  id: string;
  nombre: string;
  deporte: { id: number; nombre: string };
  /** RN4: Programada, Iniciada, Archivada o Cancelada. */
  estado: EstadoActividad;
  fechaHoraInicio: string;
  /** RN4: solo en estado Iniciada; null en los demás. */
  fechaLimiteGastos: string | null;
  nivel: NivelActividad;
  descripcion: string | null;
  /** null si la actividad no tiene punto de partida (CU10: el origen es opcional). */
  origen: Ubicacion | null;
  destino: Ubicacion;
  cupoMaximo: number;
  /** Participantes más invitados externos. */
  cuposOcupados: number;
  /** null si el organizador cerró su cuenta. */
  organizador: { id: string; nombre: string; fotoUrl: string | null } | null;
  /** En centésimos (120000 = $ 1.200); null si no corresponde. */
  costoEstimadoCentesimos: number | null;
  /** null si no hay información ambiental disponible. */
  pronostico: PronosticoDto | null;
  miRol: RolEnActividad;
  opciones: OpcionDeActividad[];
}

export interface ParticipanteDto {
  usuario: { id: string; nombre: string; fotoUrl: string | null } | null;
  esOrganizador: boolean;
  invitadosExternos: string[];
}

export interface ParticipantesDto {
  participantes: ParticipanteDto[];
  pagina: number;
  hayMas: boolean;
}

export function aDetalleActividadDto(detalle: DetalleDeActividad, usuarioId: string): DetalleActividadDto {
  const { actividad, organizador, pronostico } = detalle;
  const rol = actividad.rolDe(usuarioId, detalle.participaElUsuario);
  const fechaLimiteGastos = actividad.fechaLimiteGastos();

  return {
    id: actividad.id,
    nombre: actividad.nombre,
    deporte: { id: actividad.deporte.id, nombre: actividad.deporte.nombre },
    estado: actividad.estado,
    fechaHoraInicio: actividad.fechaHoraInicio.toISOString(),
    fechaLimiteGastos: fechaLimiteGastos === null ? null : fechaLimiteGastos.toISOString(),
    nivel: actividad.nivel,
    descripcion: actividad.descripcion,
    origen: actividad.origen,
    destino: actividad.destino,
    cupoMaximo: actividad.cupoMaximo,
    cuposOcupados: actividad.cuposOcupados,
    organizador,
    costoEstimadoCentesimos: actividad.costoEstimadoCentesimos,
    pronostico:
      pronostico === null
        ? null
        : {
            resumen: pronostico.resumen,
            nivelRecomendado: pronostico.nivelRecomendado,
            interpretacionDisponible: pronostico.interpretacionDisponible,
            fechaGeneracion: pronostico.fechaGeneracion.toISOString(),
          },
    miRol: rol,
    opciones: actividad.opcionesPara(rol),
  };
}

function aParticipanteDto(participante: ParticipanteDeActividad): ParticipanteDto {
  return {
    usuario: participante.usuario,
    esOrganizador: participante.esOrganizador,
    invitadosExternos: participante.invitadosExternos,
  };
}

export function aParticipantesDto(paginaDeParticipantes: PaginaDeParticipantes, pagina: number): ParticipantesDto {
  return {
    participantes: paginaDeParticipantes.participantes.map(aParticipanteDto),
    pagina,
    hayMas: paginaDeParticipantes.hayMas,
  };
}

// --- CU10 – Crear actividad ---

/** CU10 E1/E4: IDs resueltos por el servidor; el destino provisional tiene un identificador reservado. */
const lugarId = z.string().trim().min(1, 'Seleccioná una ubicación de Google Maps.').max(255);
export const esquemaCoordenadas = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict();

/** CU10: datos del formulario de alta. Los límites de texto/dinero corresponden al esquema SQL existente. Los límites de texto/dinero corresponden al esquema SQL existente. */
export const esquemaCrearActividad = z
  .object({
    nombre: z.string().trim().min(1, 'Ingresá el nombre.').max(100),
    descripcion: z.string().trim().min(1, 'Ingresá una descripción.').max(1000),
    deporteId: z.number().int().positive(),
    fechaHoraInicio: z.string().datetime({ offset: true, message: 'Ingresá fecha y hora con zona horaria.' }),
    cupoMaximo: z.number().int().min(2).max(32767),
    nivel: z.enum(NIVELES_ACTIVIDAD as [NivelActividad, ...NivelActividad[]]),
    origenPlaceId: lugarId.nullable().default(null),
    destinoPlaceId: lugarId.nullable().default(null),
    origenCoordenadas: esquemaCoordenadas.optional(),
    destinoCoordenadas: esquemaCoordenadas.optional(),
    tieneVehiculo: z.boolean(),
    lugaresVehiculo: z.number().int().min(0).max(32767).nullable(),
    requiereVehiculo: z.boolean(),
    invitados: z.array(z.string().trim().min(1, 'Ingresá el nombre del participante externo.').max(100)).max(32766),
    costoEstimadoCentavos: z.number().int().min(0).max(999999999999).nullable(),
  })
  .strict()
  .superRefine((datos, contexto) => {
    if (datos.origenPlaceId && datos.origenCoordenadas) {
      contexto.addIssue({
        code: 'custom',
        path: ['origenPlaceId'],
        message: 'Elegí un lugar o un pin para el origen, no ambos.',
      });
    }
    if (Boolean(datos.destinoPlaceId) === Boolean(datos.destinoCoordenadas)) {
      contexto.addIssue({ code: 'custom', path: ['destinoPlaceId'], message: 'Seleccioná un lugar o un pin como destino.' });
    }
    if (datos.tieneVehiculo && datos.lugaresVehiculo === null) {
      contexto.addIssue({ code: 'custom', path: ['lugaresVehiculo'], message: 'Indicá cuántas personas podés llevar.' });
    }
    if (!datos.tieneVehiculo && datos.lugaresVehiculo !== null) {
      contexto.addIssue({ code: 'custom', path: ['lugaresVehiculo'], message: 'Solo indicá lugares si tenés vehículo.' });
    }
  });

export const esquemaClaveIdempotencia = z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/, 'Falta una clave válida para este intento.');
export const esquemaBusquedaUbicacion = z.object({
  texto: z.string().trim().min(3, 'Ingresá al menos tres caracteres.').max(200),
  sesion: z.string().uuid(),
});
export const esquemaConsultaPunto = z.object({
  lat: z.string().trim().min(1).pipe(z.coerce.number().min(-90).max(90)),
  lng: z.string().trim().min(1).pipe(z.coerce.number().min(-180).max(180)),
});
export const esquemaConsultaLugar = z.object({ placeId: lugarId });

export type DatosCrearActividad = z.infer<typeof esquemaCrearActividad>;

export interface UbicacionActividad {
  direccion: string;
  lat: number;
  lng: number;
  departamento: string;
}

export interface SugerenciaUbicacion {
  placeId: string;
  descripcion: string;
}

export interface ActividadCreadaDto {
  id: string;
  nombre: string;
  estado: 'programada';
  cantidadParticipantes: number;
  cuposDisponibles: number;
  costoEstimadoCentavos: number | null;
  costoPorPersonaCentavos: number | null;
  destinoProvisional: boolean;
}

/** Preview orientativo: el costo real y los balances corresponden a otros CU. */
export function aActividadCreada(
  id: string,
  datos: Pick<DatosCrearActividad, 'nombre' | 'invitados' | 'cupoMaximo' | 'costoEstimadoCentavos'>,
  destinoProvisional = false,
): ActividadCreadaDto {
  const cantidadParticipantes = 1 + datos.invitados.length;
  return {
    id,
    nombre: datos.nombre,
    estado: 'programada',
    destinoProvisional,
    cantidadParticipantes,
    cuposDisponibles: datos.cupoMaximo - cantidadParticipantes,
    costoEstimadoCentavos: datos.costoEstimadoCentavos,
    costoPorPersonaCentavos:
      datos.costoEstimadoCentavos === null ? null : Math.round(datos.costoEstimadoCentavos / cantidadParticipantes),
  };
}
