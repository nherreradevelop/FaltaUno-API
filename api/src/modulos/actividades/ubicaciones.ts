import type { UbicacionActividad } from './actividades.dto';

/** Punto elegido por el usuario; la API comprueba país y departamento con el proveedor. */
export interface Coordenadas {
  lat: number;
  lng: number;
}

/** Puerto de geocodificación inversa, independiente de la búsqueda por nombres de lugares. */
export interface ResolvedorPuntos {
  resolver(punto: Coordenadas): Promise<UbicacionActividad>;
}
