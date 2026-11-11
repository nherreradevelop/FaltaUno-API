import { errores } from '../../comun/errores';
import type { DatosCrearActividad } from './actividades.dto';

/** Actividad por crear: reglas que dependen únicamente de sus datos. */
export class Actividad {
  constructor(readonly datos: DatosCrearActividad) {}

  /** CU10 RN1/RN2/RN5: se vuelve a validar al guardar, no solo al abrir el formulario. */
  validarCreacion(maximoParticipantes: number, ahora: Date): void {
    const campos: Record<string, string> = {};
    if (new Date(this.datos.fechaHoraInicio) <= ahora) {
      campos.fechaHoraInicio = 'La fecha y hora deben ser futuras.';
    }
    if (this.datos.cupoMaximo > maximoParticipantes) {
      campos.cupoMaximo = `El máximo permitido es ${maximoParticipantes}.`;
    }
    if (this.datos.tieneVehiculo && this.datos.origenPlaceId === null && !this.datos.origenCoordenadas) {
      campos.origenPlaceId = 'Si tenés vehículo propio, seleccioná tu punto de origen.';
    }
    // Los invitados ocupan lugares igual que el organizador (CU11 RN5/RN6/RN9).
    if (1 + this.datos.invitados.length > this.datos.cupoMaximo) {
      campos.invitados = 'El organizador y sus invitados no pueden superar el cupo.';
    }
    if (Object.keys(campos).length > 0) {
      throw errores.validacion(campos);
    }
  }
}
