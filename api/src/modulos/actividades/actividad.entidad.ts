import type { Deporte } from '../deportes/deporte.entidad';

export type EstadoActividad = 'programada' | 'iniciada' | 'archivada' | 'cancelada';
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

/** CU09 FP paso 3: relación del usuario con la actividad. */
export type RolEnActividad = 'organizador' | 'participante' | 'ninguno';

/** CU09 FP paso 4 y A1/A2: opciones que el detalle puede ofrecer. */
export type OpcionDeActividad =
  | 'verParticipantes'
  | 'verMapa'
  | 'unirse'
  | 'abandonar'
  | 'verChat'
  | 'verGastos'
  | 'invitarAmigos'
  | 'modificarParticipacion'
  | 'silenciar'
  | 'valorar'
  | 'compartir'
  | 'editar'
  | 'removerParticipantes'
  | 'cancelar'
  | 'archivar';

export interface Ubicacion {
  direccion: string;
  lat: number;
  lng: number;
}

interface ReglaDeOpcion {
  roles: RolEnActividad[];
  estados: EstadoActividad[];
}

const TODOS_LOS_ROLES: RolEnActividad[] = ['organizador', 'participante', 'ninguno'];
const QUIENES_FORMAN_PARTE: RolEnActividad[] = ['organizador', 'participante'];
const TODOS_LOS_ESTADOS: EstadoActividad[] = ['programada', 'iniciada', 'archivada', 'cancelada'];

/**
 * CU09 FP paso 4, RN2 y RN5: quién ve cada opción y en qué estados.
 * Sale del glosario de estados y de las precondiciones de cada CU (matriz aprobada en el plan del CU09).
 * "unirse" además necesita cupo libre: se resuelve en admiteIncorporaciones (RN3).
 */
const REGLAS_DE_OPCIONES: Record<OpcionDeActividad, ReglaDeOpcion> = {
  verParticipantes: { roles: TODOS_LOS_ROLES, estados: TODOS_LOS_ESTADOS }, // A1
  verMapa: { roles: TODOS_LOS_ROLES, estados: TODOS_LOS_ESTADOS }, // A2
  unirse: { roles: ['ninguno'], estados: ['programada'] }, // CU11
  abandonar: { roles: ['participante'], estados: ['programada'] }, // CU12: el organizador no abandona
  verChat: { roles: QUIENES_FORMAN_PARTE, estados: ['programada', 'iniciada', 'archivada'] }, // CU16, RN5
  verGastos: { roles: QUIENES_FORMAN_PARTE, estados: ['iniciada', 'archivada'] }, // CU34, RN5
  invitarAmigos: { roles: QUIENES_FORMAN_PARTE, estados: ['programada'] }, // CU17
  modificarParticipacion: { roles: QUIENES_FORMAN_PARTE, estados: ['programada'] }, // CU28
  silenciar: { roles: QUIENES_FORMAN_PARTE, estados: ['programada', 'iniciada'] }, // CU20
  valorar: { roles: QUIENES_FORMAN_PARTE, estados: ['iniciada', 'archivada'] }, // CU21, RN5
  compartir: { roles: TODOS_LOS_ROLES, estados: ['programada', 'iniciada'] }, // CU19
  editar: { roles: ['organizador'], estados: ['programada'] }, // CU29
  removerParticipantes: { roles: ['organizador'], estados: ['programada'] }, // CU31
  cancelar: { roles: ['organizador'], estados: ['programada'] }, // CU13
  archivar: { roles: ['organizador'], estados: ['iniciada'] }, // CU32
};

/** Glosario, Estado Iniciada: dura 14 días desde el inicio; ese es el plazo para registrar gastos y pagos. */
const DIAS_PARA_REGISTRAR_GASTOS = 14;
const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/** Actividad deportiva (diagrama de clases). */
export class Actividad {
  constructor(
    readonly id: string,
    readonly nombre: string,
    readonly deporte: Deporte,
    readonly estado: EstadoActividad,
    readonly fechaHoraInicio: Date,
    readonly nivel: NivelActividad,
    readonly descripcion: string | null,
    readonly origen: Ubicacion,
    readonly destino: Ubicacion,
    /** Departamento del destino, calculado a partir del mapa al crear la actividad (CU10). Lo usa el filtro del CU08 A5. */
    readonly departamento: string,
    readonly cupoMaximo: number,
    /** Participantes más sus invitados externos: los invitados también ocupan cupo (CU10 RN9, CU28 RN2). */
    readonly cuposOcupados: number,
    /** null si el organizador cerró su cuenta (CU33). */
    readonly organizadorId: string | null,
    /** En centésimos para no operar con decimales; null si no se indicó. */
    readonly costoEstimadoCentesimos: number | null,
  ) {}

  cuposLibres(): number {
    return Math.max(0, this.cupoMaximo - this.cuposOcupados);
  }

  /** Glosario: "Completa" es una actividad Programada sin cupos libres (no es un estado). */
  estaCompleta(): boolean {
    return this.estado === 'programada' && this.cuposLibres() === 0;
  }

  /** CU09 RN3 y glosario: solo una actividad Programada con cupo libre admite nuevas incorporaciones. */
  admiteIncorporaciones(): boolean {
    return this.estado === 'programada' && !this.estaCompleta();
  }

  /** CU09 RN4: en estado Iniciada se indica la fecha límite para registrar gastos y pagos. */
  fechaLimiteGastos(): Date | null {
    if (this.estado !== 'iniciada') {
      return null;
    }
    return new Date(this.fechaHoraInicio.getTime() + DIAS_PARA_REGISTRAR_GASTOS * MILISEGUNDOS_POR_DIA);
  }

  /** CU09 FP paso 3. El organizador también tiene participación (CU10 paso 10), pero su rol es organizador. */
  rolDe(usuarioId: string, participa: boolean): RolEnActividad {
    if (this.organizadorId === usuarioId) {
      return 'organizador';
    }
    if (participa) {
      return 'participante';
    }
    return 'ninguno';
  }

  /** CU09 FP paso 4 y RN2: opciones según el rol del usuario y el estado de la actividad. */
  opcionesPara(rol: RolEnActividad): OpcionDeActividad[] {
    const opciones = Object.keys(REGLAS_DE_OPCIONES) as OpcionDeActividad[];
    return opciones.filter((opcion) => this.correspondeOpcion(opcion, rol));
  }

  private correspondeOpcion(opcion: OpcionDeActividad, rol: RolEnActividad): boolean {
    const regla = REGLAS_DE_OPCIONES[opcion];
    const rolPermitido = regla.roles.includes(rol);
    const estadoPermitido = regla.estados.includes(this.estado);
    if (!rolPermitido || !estadoPermitido) {
      return false;
    }
    // CU09 RN3 / E1: sin cupo o fuera de Programada no se ofrece unirse
    if (opcion === 'unirse') {
      return this.admiteIncorporaciones();
    }
    return true;
  }
}
