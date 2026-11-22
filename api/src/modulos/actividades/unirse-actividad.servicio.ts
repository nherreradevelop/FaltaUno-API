import { AppError, errores } from '../../comun/errores';
import type { GoogleMaps } from '../../infra/google-maps';
import type { Logger } from '../../infra/logger';
import type { MotivoSinIncorporacion, Ubicacion } from './actividad.entidad';
import type { DatosUnirseActividad, IncorporacionDto } from './actividades.dto';
import type { EventosDeActividades } from './actividades.eventos';
import type { ActividadesRepositorio } from './actividades.repositorio';
import { actividadNoDisponible } from './actividades.servicio';
import type { ResolvedorPuntos } from './ubicaciones';

/** Solo lo que usa este servicio: permite probarlo con dobles en memoria. */
export interface DependenciasUnirseActividad {
  transaccion: <T>(
    operacion: (repositorio: Pick<ActividadesRepositorio, 'bloquearParaIncorporacion' | 'registrarParticipacion'>) => Promise<T>,
  ) => Promise<T>;
  mapas: Pick<GoogleMaps, 'resolver'>;
  puntos: ResolvedorPuntos;
  eventos: Pick<EventosDeActividades, 'participanteUnido'>;
  logger: Pick<Logger, 'error'>;
  ahora?: () => Date;
}

/** Código y mensaje al usuario de cada motivo de rechazo (CU11 paso 4). */
const RECHAZOS: Record<Exclude<MotivoSinIncorporacion, 'faltanLugaresParaInvitados'>, { codigo: string; mensaje: string }> = {
  cancelada: { codigo: 'ACTIVIDAD_CANCELADA', mensaje: 'La actividad fue cancelada. No es posible unirse.' }, // E3
  yaNoAdmite: { codigo: 'ACTIVIDAD_NO_ADMITE_INCORPORACIONES', mensaje: 'Ya no es posible unirse a esta actividad.' }, // E2
  yaParticipa: { codigo: 'YA_PARTICIPA', mensaje: 'Ya estás anotado en esta actividad.' }, // RN2
  completa: { codigo: 'ACTIVIDAD_COMPLETA', mensaje: 'La actividad está completa.' }, // E1
};

/**
 * CU11 – Unirse a una actividad.
 * Va aparte de ActividadesServicio (CU08 y CU09) porque necesita transacción, Google Maps y eventos de dominio.
 */
export class UnirseActividadServicio {
  constructor(private readonly dependencias: DependenciasUnirseActividad) {}

  /**
   * CU11 FP pasos 4 a 9. La sesión ya la validó requiereSesion (RN1, ER2).
   * El punto de partida se resuelve antes de abrir la transacción, para no tenerla abierta mientras responde Google.
   */
  async unirse(usuarioId: string, actividadId: string, datos: DatosUnirseActividad): Promise<IncorporacionDto> {
    const puntoPartida = await this.resolverPuntoDePartida(datos);
    const lugaresPedidos = 1 + datos.invitados.length; // RN5: el usuario y cada invitado ocupan un lugar

    const incorporacion = await this.registrar(usuarioId, actividadId, datos, puntoPartida, lugaresPedidos);

    // FP paso 9: se avisa después del commit; si la transacción falló, no se notifica a nadie (ER1)
    this.dependencias.eventos.participanteUnido.notificar({
      actividadId,
      usuarioId,
      organizadorId: incorporacion.organizadorId,
      cantidadInvitados: datos.invitados.length,
    });
    return incorporacion.dto;
  }

  /** FP pasos 4, 7 y 8 en una sola transacción, con la actividad bloqueada (RN8, RNF-14). */
  private async registrar(
    usuarioId: string,
    actividadId: string,
    datos: DatosUnirseActividad,
    puntoPartida: Ubicacion | null,
    lugaresPedidos: number,
  ): Promise<{ dto: IncorporacionDto; organizadorId: string | null }> {
    try {
      return await this.dependencias.transaccion(async (repositorio) => {
        const encontrada = await repositorio.bloquearParaIncorporacion(actividadId, usuarioId);
        if (encontrada === null) {
          throw actividadNoDisponible();
        }
        const { actividad, yaParticipa } = encontrada;

        const motivo = actividad.motivoSinIncorporacion(lugaresPedidos, yaParticipa, this.ahora());
        if (motivo !== null) {
          // Pendiente: CU35 – si está completa, ofrecer anotarse en la lista de espera (RN12)
          throw errorSinIncorporacion(motivo, actividad.cuposLibres());
        }

        await repositorio.registrarParticipacion(actividadId, usuarioId, {
          tieneVehiculo: datos.tieneVehiculo,
          lugaresVehiculo: datos.lugaresVehiculo,
          puntoPartida,
          invitados: datos.invitados,
        });
        // Pendiente: CU18 – si llegó desde una invitación, marcarla aceptada en esta misma transacción (RN11)
        // Pendiente: CU22 – sumar el punto de partida al trayecto estimado si no aporta vehículo (RN10)

        const cuposOcupados = actividad.cuposOcupados + lugaresPedidos; // FP paso 8
        const dto: IncorporacionDto = {
          actividadId,
          cupoMaximo: actividad.cupoMaximo,
          cuposOcupados,
          cuposLibres: actividad.cupoMaximo - cuposOcupados,
        };
        return { dto, organizadorId: actividad.organizadorId };
      });
    } catch (error) {
      if (!(error instanceof AppError)) {
        // ER1: no se registró nada (la transacción se revirtió). El manejador responde 500 y el usuario puede reintentar
        this.dependencias.logger.error(
          { evento: 'cu11_registro_participante_fallido', err: error, actividadId, usuarioId },
          'No se pudo registrar al participante en la actividad',
        );
      }
      throw error;
    }
  }

  /** FP paso 5: el punto de partida es opcional; si se indica, lo valida Google (igual que en el CU10). */
  private async resolverPuntoDePartida(datos: DatosUnirseActividad): Promise<Ubicacion | null> {
    if (datos.puntoPartidaCoordenadas) {
      return this.dependencias.puntos.resolver(datos.puntoPartidaCoordenadas);
    }
    if (datos.puntoPartidaPlaceId) {
      return this.dependencias.mapas.resolver(datos.puntoPartidaPlaceId);
    }
    return null;
  }

  private ahora(): Date {
    return this.dependencias.ahora?.() ?? new Date();
  }
}

/** El error que ve el usuario para cada motivo de rechazo. */
function errorSinIncorporacion(motivo: MotivoSinIncorporacion, cuposLibres: number): AppError {
  if (motivo === 'faltanLugaresParaInvitados') {
    return errores.conflicto(
      'LUGARES_INSUFICIENTES',
      `No hay lugar para todos tus invitados. ${textoLugaresLibres(cuposLibres)}`,
    );
  }
  const { codigo, mensaje } = RECHAZOS[motivo];
  return errores.conflicto(codigo, mensaje);
}

function textoLugaresLibres(cuposLibres: number): string {
  if (cuposLibres === 1) {
    return 'Queda 1 lugar.';
  }
  return `Quedan ${cuposLibres} lugares.`;
}
