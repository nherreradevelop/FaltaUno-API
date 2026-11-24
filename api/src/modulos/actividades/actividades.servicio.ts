import { errores } from '../../comun/errores';
import {
  aActividadEncontradaDto,
  aDetalleActividadDto,
  aParticipantesDto,
  TAMANO_PAGINA_BUSQUEDA,
  TAMANO_PAGINA_PARTICIPANTES,
  type DetalleActividadDto,
  type FiltrosDeBusqueda,
  type ParticipantesDto,
  type ResultadoDeBusquedaDto,
} from './actividades.dto';
import type { ActividadesRepositorio } from './actividades.repositorio';

/** Solo los métodos que usa este servicio: permite probarlo con dobles en memoria. */
export interface DependenciasActividades {
  actividades: Pick<ActividadesRepositorio, 'buscarDisponibles' | 'buscarDetalle' | 'buscarRelacion' | 'buscarParticipantes'>;
}

/** CU09 E2: la actividad no existe. También se usa para un id con formato inválido. */
export function actividadNoDisponible() {
  return errores.noEncontrado('ACTIVIDAD_NO_DISPONIBLE', 'La actividad no está disponible.');
}

/**
 * Quién ve el punto de partida de los demás (CU11 paso 5). Decisión del equipo del 21/11/2026, pendiente de pasar
 * a la ficha: lo ven quienes forman parte de la actividad (participantes y organizador), no cualquiera que abra el detalle.
 * Si se decide ocultarlo, alcanza con cambiar esta función.
 */
export function puedeVerPuntosDePartida(participaQuienConsulta: boolean): boolean {
  return participaQuienConsulta;
}

export class ActividadesServicio {
  constructor(private readonly dependencias: DependenciasActividades) {}

  /**
   * CU08 – Buscar actividades. Devuelve una página de actividades disponibles que cumplen los filtros.
   * Una lista vacía es el caso E1: el cliente informa que no hay actividades y sugiere crear una.
   */
  async buscar(usuarioId: string, filtros: FiltrosDeBusqueda, pagina: number): Promise<ResultadoDeBusquedaDto> {
    const encontradas = await this.dependencias.actividades.buscarDisponibles(filtros, pagina, TAMANO_PAGINA_BUSQUEDA, usuarioId);
    return {
      actividades: encontradas.actividades.map((encontrada) => aActividadEncontradaDto(encontrada, usuarioId)),
      pagina,
      hayMas: encontradas.hayMas,
    };
  }

  /**
   * CU09 – Detalle de actividad.
   * Cualquier usuario autenticado puede verlo, participe o no (RN1). Una actividad cancelada o archivada
   * también se muestra (E1, RN3, RN5): lo que cambia son las opciones que se ofrecen (RN2).
   */
  async obtenerDetalle(usuarioId: string, actividadId: string): Promise<DetalleActividadDto> {
    const detalle = await this.dependencias.actividades.buscarDetalle(actividadId, usuarioId);
    if (detalle === null) {
      throw actividadNoDisponible(); // CU09 E2
    }
    return aDetalleActividadDto(detalle, usuarioId);
  }

  /**
   * CU09 A1: participantes (usuarios registrados e invitados externos), de a TAMANO_PAGINA_PARTICIPANTES.
   * Incluye el punto de partida de cada uno solo si quien consulta puede verlo (puedeVerPuntosDePartida).
   */
  async obtenerParticipantes(usuarioId: string, actividadId: string, pagina: number): Promise<ParticipantesDto> {
    const { actividades } = this.dependencias;
    // Las dos consultas son independientes: se hacen en paralelo
    const [relacion, paginaDeParticipantes] = await Promise.all([
      actividades.buscarRelacion(actividadId, usuarioId),
      actividades.buscarParticipantes(actividadId, pagina, TAMANO_PAGINA_PARTICIPANTES),
    ]);
    if (!relacion.existe) {
      throw actividadNoDisponible(); // CU09 E2
    }
    return aParticipantesDto(paginaDeParticipantes, pagina, puedeVerPuntosDePartida(relacion.participa));
  }
}
