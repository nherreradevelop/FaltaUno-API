import type { DeportesRepositorio } from './deportes.repositorio';

export interface DeporteDto {
  id: number;
  nombre: string;
}

export class DeportesServicio {
  constructor(private readonly deportes: Pick<DeportesRepositorio, 'listarActivos'>) {}

  /** CU08 A1: deportes activos del catálogo, para el filtro de la búsqueda. */
  async listarActivos(): Promise<DeporteDto[]> {
    const deportes = await this.deportes.listarActivos();
    return deportes.map((deporte) => ({ id: deporte.id, nombre: deporte.nombre }));
  }
}
