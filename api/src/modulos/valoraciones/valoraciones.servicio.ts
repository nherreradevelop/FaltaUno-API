import { errores } from '../../comun/errores';
import type { Logger } from '../../infra/logger';
import { admiteValoraciones, type EstadoActividad } from '../actividades/actividad.entidad';
import { actividadNoDisponible } from '../actividades/actividades.servicio';
import { Valoracion } from './valoracion.entidad';
import type { DatosValoracion, ParticipantesParaValorarDto, ValoracionGuardadaDto } from './valoraciones.dto';
import type { ValoracionesRepositorio } from './valoraciones.repositorio';

/** Solo los métodos que usa este servicio: permite probarlo con dobles en memoria. */
export interface DependenciasValoraciones {
  valoraciones: Pick<
    ValoracionesRepositorio,
    'buscarActividadParaValorar' | 'participo' | 'buscarParticipantesParaValorar' | 'guardar'
  >;
  logger: Pick<Logger, 'error'>;
}

/** CU21 E2: mensajes según el estado de la actividad. */
const MENSAJES_VALORACION_NO_HABILITADA: Partial<Record<EstadoActividad, string>> = {
  programada: 'Vas a poder valorar a los participantes cuando la actividad se inicie.',
  cancelada: 'La valoración no está disponible en actividades canceladas.',
};

/** CU21 RN1. */
const MENSAJE_SOLO_PARTICIPANTES = 'Solo podés valorar a quienes participaron de esta actividad.';

/**
 * CU21 – Sistema de valoración de usuarios.
 * El promedio de cada usuario no se guarda: se calcula con todas sus valoraciones al consultarlo (RN4, ver
 * ValoracionesRepositorio.resumenRecibido). Por eso el paso 9 no es una escritura aparte y ER2 no puede ocurrir:
 * apenas se guarda la valoración, el promedio ya la incluye.
 * Pendiente: CU32 – Archivar actividad (RN7: al archivarla se avisa a los participantes que pueden valorarse,
 * con la notificación de tipo valoracionPendiente de CU40).
 */
export class ValoracionesServicio {
  constructor(private readonly dependencias: DependenciasValoraciones) {}

  /** CU21 FP pasos 1 y 2: los demás participantes, cada uno con la valoración que ya le dio el usuario o pendiente. */
  async listarParticipantes(usuarioId: string, actividadId: string): Promise<ParticipantesParaValorarDto> {
    await this.verificarQuePuedeValorar(usuarioId, actividadId);
    const participantes = await this.dependencias.valoraciones.buscarParticipantesParaValorar(actividadId, usuarioId);
    return { participantes };
  }

  /**
   * CU21 FP pasos 6 a 10. Si ya lo había valorado en esta actividad, la nueva valoración reemplaza a la anterior (A2, RN2).
   * Los participantes ya no cambian desde que la actividad se inicia (CU12 RN1), así que validar y guardar no
   * necesitan una transacción.
   */
  async valorar(
    usuarioId: string,
    actividadId: string,
    evaluadoId: string,
    datos: DatosValoracion,
  ): Promise<ValoracionGuardadaDto> {
    const valoracion = new Valoracion(actividadId, usuarioId, evaluadoId, datos.puntaje, datos.comentario);
    if (valoracion.esAutovaloracion()) {
      throw errores.prohibido('VALORACION_PROPIA', 'No podés valorarte a vos mismo.'); // RN5
    }
    await this.verificarQuePuedeValorar(usuarioId, actividadId);
    const evaluadoParticipo = await this.dependencias.valoraciones.participo(actividadId, evaluadoId);
    if (!evaluadoParticipo) {
      throw errores.prohibido('NO_PARTICIPO', MENSAJE_SOLO_PARTICIPANTES); // RN1
    }

    await this.guardar(valoracion);
    return { valoracion: { puntaje: valoracion.puntaje, comentario: valoracion.comentario } };
  }

  /** CU21 FP paso 1, E2 y RN1: la actividad existe, admite valoraciones y el usuario participó. */
  private async verificarQuePuedeValorar(usuarioId: string, actividadId: string): Promise<void> {
    const actividad = await this.dependencias.valoraciones.buscarActividadParaValorar(actividadId, usuarioId);
    if (actividad === null) {
      throw actividadNoDisponible();
    }
    if (!admiteValoraciones(actividad.estado)) {
      const mensaje = MENSAJES_VALORACION_NO_HABILITADA[actividad.estado] ?? 'La valoración no está disponible.';
      throw errores.conflicto('VALORACION_NO_HABILITADA', mensaje); // E2
    }
    if (!actividad.participa) {
      throw errores.prohibido('NO_PARTICIPO', MENSAJE_SOLO_PARTICIPANTES); // RN1
    }
  }

  /** CU21 FP paso 8. ER1: se registra qué valoración falló y el manejador de errores responde 500. */
  private async guardar(valoracion: Valoracion): Promise<void> {
    try {
      await this.dependencias.valoraciones.guardar(valoracion);
    } catch (error) {
      this.dependencias.logger.error(
        {
          evento: 'valoracion_no_guardada',
          actividadId: valoracion.actividadId,
          evaluadorId: valoracion.evaluadorId,
          evaluadoId: valoracion.evaluadoId,
          err: error,
        },
        'No se pudo guardar la valoración',
      );
      throw error;
    }
  }
}
