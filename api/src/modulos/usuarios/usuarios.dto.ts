import { z } from 'zod';
import type { ActividadDelHistorial, EstadoActividad, PaginaDeHistorial } from '../actividades/actividades.repositorio';
import type { Deporte } from '../deportes/deporte.entidad';
import type { ResumenDeValoraciones } from '../valoraciones/valoraciones.repositorio';
import type { Usuario } from './usuario.entidad';

/** CU04 FP: el historial se muestra de a 10 actividades. */
export const TAMANO_PAGINA_HISTORIAL = 10;

/** CU04 A1: id del usuario cuyo perfil se consulta. */
export const esquemaIdDeUsuario = z.string().uuid();

/** CU04 FP: página del historial de actividades (query ?pagina=N, empieza en 1). */
export const esquemaPaginaHistorial = z.object({
  pagina: z.coerce
    .number({ invalid_type_error: 'La página tiene que ser un número.' })
    .int('La página tiene que ser un número entero.')
    .min(1, 'La página empieza en 1.')
    .default(1),
});

export interface DeporteDto {
  id: number;
  nombre: string;
}

/** CU04 RN1 y A1: información pública del perfil. Nunca incluye el correo. */
export interface PerfilPublicoDto {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  biografia: string | null;
  deportes: DeporteDto[];
  /** Promedio con 2 decimales, o null si todavía no tiene valoraciones. */
  valoracionPromedio: number | null;
  /** Cantidad de actividades archivadas o canceladas en las que participó. El detalle no es público. */
  cantidadActividades: number;
  /** CU04 RN2: el cliente muestra "Editar perfil" solo si es true. */
  esPropio: false;
}

/**
 * CU04 FP: el perfil propio agrega el correo y la cantidad de valoraciones recibidas. En lugar de la cantidad
 * de actividades muestra el historial, que se pide aparte y paginado.
 */
export interface PerfilPropioDto extends Omit<PerfilPublicoDto, 'esPropio' | 'cantidadActividades'> {
  email: string;
  cantidadValoraciones: number;
  esPropio: true;
}

export type PerfilDto = PerfilPublicoDto | PerfilPropioDto;

export interface ActividadDelHistorialDto {
  id: string;
  nombre: string;
  deporte: string;
  fechaHoraInicio: string;
  estado: EstadoActividad;
}

export interface HistorialDto {
  actividades: ActividadDelHistorialDto[];
  pagina: number;
  hayMas: boolean;
}

function aDeporteDto(deporte: Deporte): DeporteDto {
  return { id: deporte.id, nombre: deporte.nombre };
}

export function aPerfilPublicoDto(
  usuario: Usuario,
  deportes: Deporte[],
  valoraciones: ResumenDeValoraciones,
  cantidadActividades: number,
): PerfilPublicoDto {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    fotoUrl: usuario.fotoUrl,
    biografia: usuario.biografia,
    deportes: deportes.map(aDeporteDto),
    valoracionPromedio: valoraciones.promedio,
    cantidadActividades,
    esPropio: false,
  };
}

export function aPerfilPropioDto(usuario: Usuario, deportes: Deporte[], valoraciones: ResumenDeValoraciones): PerfilPropioDto {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    fotoUrl: usuario.fotoUrl,
    biografia: usuario.biografia,
    deportes: deportes.map(aDeporteDto),
    valoracionPromedio: valoraciones.promedio,
    cantidadValoraciones: valoraciones.cantidad,
    esPropio: true,
  };
}

function aActividadDelHistorialDto(actividad: ActividadDelHistorial): ActividadDelHistorialDto {
  return {
    id: actividad.id,
    nombre: actividad.nombre,
    deporte: actividad.deporte,
    fechaHoraInicio: actividad.fechaHoraInicio.toISOString(),
    estado: actividad.estado,
  };
}

export function aHistorialDto(paginaDeHistorial: PaginaDeHistorial, pagina: number): HistorialDto {
  return {
    actividades: paginaDeHistorial.actividades.map(aActividadDelHistorialDto),
    pagina,
    hayMas: paginaDeHistorial.hayMas,
  };
}
