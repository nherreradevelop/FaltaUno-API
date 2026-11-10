import type { Deporte } from '../deportes/deporte.entidad';

export type NivelActividad = 'principiante' | 'intermedio' | 'avanzado';
export const NIVELES_ACTIVIDAD: NivelActividad[] = ['principiante', 'intermedio', 'avanzado'];

/** CU08 A4: franjas horarias, en hora de Uruguay. Las horas son inclusive. */
export type FranjaHoraria = 'manana' | 'tarde' | 'noche';
export const FRANJAS_HORARIAS: Record<FranjaHoraria, { desdeHora: number; hastaHora: number }> = {
  manana: { desdeHora: 0, hastaHora: 11 }, // 00:00 a 11:59
  tarde: { desdeHora: 12, hastaHora: 19 }, // 12:00 a 19:59
  noche: { desdeHora: 20, hastaHora: 23 }, // 20:00 a 23:59
};

/** Las fechas y franjas de las actividades se interpretan en la hora de Uruguay. */
export const ZONA_HORARIA = 'America/Montevideo';

/** Actividad (diagrama de clases). Solo con los datos que usa la búsqueda (CU08). */
/** Quién organiza la actividad y su valoración promedio como usuario (CU04 RN3). */
export interface OrganizadorDeActividad {
  id: string;
  nombre: string;
  /** Promedio con 2 decimales, o null si todavía no tiene valoraciones. */
  valoracionPromedio: number | null;
}

export class Actividad {
  constructor(
    readonly id: string,
    readonly nombre: string,
    readonly deporte: Deporte,
    readonly fechaHoraInicio: Date,
    readonly departamento: string,
    readonly nivel: NivelActividad,
    readonly cupoMaximo: number,
    /** Participantes (el organizador incluido) más sus invitados externos. */
    private readonly lugaresOcupados: number,
    /** null si el organizador cerró su cuenta (CU33: los registros compartidos se anonimizan). */
    readonly organizador: OrganizadorDeActividad | null,
  ) {}

  /** CU08 RN3 / RN7: el organizador y los invitados externos también ocupan cupo. */
  cuposLibres(): number {
    return Math.max(0, this.cupoMaximo - this.lugaresOcupados);
  }

  esOrganizadaPor(usuarioId: string): boolean {
    return this.organizador?.id === usuarioId;
  }
}
