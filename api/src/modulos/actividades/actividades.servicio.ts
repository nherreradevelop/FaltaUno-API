import { errores } from '../../comun/errores';
import {
  aDetalleActividadDto,
  aParticipantesDto,
  TAMANO_PAGINA_PARTICIPANTES,
  type DetalleActividadDto,
  type ParticipantesDto,
} from './actividades.dto';
import type { ActividadesRepositorio } from './actividades.repositorio';

/** Solo los métodos que usa este servicio: permite probarlo con dobles en memoria. */
export interface DependenciasActividades {
  actividades: Pick<ActividadesRepositorio, 'buscarDetalle' | 'existe' | 'buscarParticipantes'>;
}

/** CU09 E2: la actividad no existe. También se usa para un id con formato inválido. */
export function actividadNoDisponible() {
  return errores.noEncontrado('ACTIVIDAD_NO_DISPONIBLE', 'La actividad no está disponible.');
}

export class ActividadesServicio {
  constructor(private readonly dependencias: DependenciasActividades) {}

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

  /** CU09 A1: participantes (usuarios registrados e invitados externos), de a TAMANO_PAGINA_PARTICIPANTES. */
  async obtenerParticipantes(actividadId: string, pagina: number): Promise<ParticipantesDto> {
    const { actividades } = this.dependencias;
    // Las dos consultas son independientes: se hacen en paralelo
    const [existe, paginaDeParticipantes] = await Promise.all([
      actividades.existe(actividadId),
      actividades.buscarParticipantes(actividadId, pagina, TAMANO_PAGINA_PARTICIPANTES),
    ]);
    if (!existe) {
      throw actividadNoDisponible(); // CU09 E2
    }
    return aParticipantesDto(paginaDeParticipantes, pagina);
  }
}
