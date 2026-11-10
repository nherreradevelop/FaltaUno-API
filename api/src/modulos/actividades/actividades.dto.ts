import { z } from 'zod';
import {
  FRANJAS_HORARIAS,
  NIVELES_ACTIVIDAD,
  type Actividad,
  type FranjaHoraria,
  type NivelActividad,
} from './actividad.entidad';

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

export function aActividadEncontradaDto(actividad: Actividad, usuarioId: string): ActividadEncontradaDto {
  return {
    id: actividad.id,
    nombre: actividad.nombre,
    deporte: { id: actividad.deporte.id, nombre: actividad.deporte.nombre },
    fechaHoraInicio: actividad.fechaHoraInicio.toISOString(),
    departamento: actividad.departamento,
    nivel: actividad.nivel,
    cuposLibres: actividad.cuposLibres(),
    organizador: actividad.organizador
      ? {
          id: actividad.organizador.id,
          nombre: actividad.organizador.nombre,
          valoracionPromedio: actividad.organizador.valoracionPromedio,
        }
      : null,
    esOrganizador: actividad.esOrganizadaPor(usuarioId),
  };
}
