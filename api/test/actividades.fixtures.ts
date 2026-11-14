import { esquemaCrearActividad, type UbicacionActividad } from '../src/modulos/actividades/actividades.dto';
import { crearDestinoProvisional } from '../src/modulos/actividades/destino-provisional';

export const DESTINO_PROVISIONAL_PRUEBA = crearDestinoProvisional({
  lat: -34.47391234567891,
  lng: -57.84331234567891,
  departamento: 'Colonia',
});

export const USUARIO_ACTIVIDAD = '00000000-0000-4000-8000-000000000010';
export const AHORA_ACTIVIDAD = new Date('2026-11-07T12:00:00Z');
export const LUGAR_ACTIVIDAD: UbicacionActividad = {
  direccion: 'Montevideo, Uruguay',
  lat: -34.9,
  lng: -56.2,
  departamento: 'Montevideo',
};
export function datosActividad(cambios: Record<string, unknown> = {}) {
  return esquemaCrearActividad.parse({
    nombre: 'Salida de surf',
    descripcion: 'Encuentro para compartir la mañana en la playa.',
    deporteId: 1,
    fechaHoraInicio: '2026-11-20T10:00:00Z',
    cupoMaximo: 5,
    nivel: 'intermedio',
    origenPlaceId: 'origen-prueba',
    destinoPlaceId: 'destino-prueba',
    tieneVehiculo: true,
    lugaresVehiculo: 3,
    requiereVehiculo: false,
    invitados: ['Ana'],
    costoEstimadoCentavos: 120050,
    ...cambios,
  });
}
