import type { UbicacionActividad } from './actividades.dto';

/** Excepción aprobada de CU10: solo se ofrece si Google Maps no está disponible. */
export const DESTINO_PROVISIONAL_ID = 'faltauno:destino-provisional';

/** Arma el destino de CU10 con la ubicación configurada, conservando su descripción provisional. */
export function crearDestinoProvisional(ubicacion: Pick<UbicacionActividad, 'lat' | 'lng' | 'departamento'>): UbicacionActividad {
  return {
    ...ubicacion,
    direccion: 'Ubicación por defecto (pendiente de editar por el organizador)',
  };
}
