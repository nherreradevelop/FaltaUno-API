import type { ActividadesRepositorio } from './actividades.repositorio';
import {
  aActividadEncontradaDto,
  TAMANO_PAGINA_BUSQUEDA,
  type FiltrosDeBusqueda,
  type ResultadoDeBusquedaDto,
} from './actividades.dto';

/** Solo los métodos que usa este servicio: permite probarlo con dobles en memoria. */
export interface DependenciasActividades {
  actividades: Pick<ActividadesRepositorio, 'buscarDisponibles'>;
}

export class ActividadesServicio {
  constructor(private readonly dependencias: DependenciasActividades) {}

  /**
   * CU08 – Buscar actividades. Devuelve una página de actividades disponibles que cumplen los filtros.
   * Una lista vacía es el caso E1: el cliente informa que no hay actividades y sugiere crear una.
   */
  async buscar(usuarioId: string, filtros: FiltrosDeBusqueda, pagina: number): Promise<ResultadoDeBusquedaDto> {
    const encontradas = await this.dependencias.actividades.buscarDisponibles(filtros, pagina, TAMANO_PAGINA_BUSQUEDA);
    return {
      actividades: encontradas.actividades.map((actividad) => aActividadEncontradaDto(actividad, usuarioId)),
      pagina,
      hayMas: encontradas.hayMas,
    };
  }
}
