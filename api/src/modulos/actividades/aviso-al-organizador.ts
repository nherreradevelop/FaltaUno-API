import type { Observador } from '../../comun/observable';
import type { Logger } from '../../infra/logger';
import type { ParticipanteUnido } from './actividades.eventos';
import type { ActividadesRepositorio } from './actividades.repositorio';

/**
 * Lo que el aviso le pide a las notificaciones del CU40. Tiene la misma forma que
 * NotificacionesServicio.notificar(usuarioId, { tipo, texto, destino }), así que se le pasa ese servicio tal cual.
 */
export interface Notificador {
  notificar(usuarioId: string, datos: NotificacionDeParticipanteUnido): Promise<unknown>;
}

/** CU11 paso 9: el aviso al organizador. El tipo tiene que existir en TIPOS_NOTIFICACION del CU40. */
export interface NotificacionDeParticipanteUnido {
  tipo: 'participanteUnido';
  texto: string;
  /** CU40 FP paso 7: al tocarla, lleva al detalle de la actividad. */
  destino: { tipo: 'actividad'; id: string };
}

/**
 * CU11 ER3: esperas entre reintentos cuando no se puede generar la notificación.
 * Pendiente: consultar al equipo cuántos reintentos y cada cuánto (la ficha no lo define).
 */
export const ESPERAS_ENTRE_REINTENTOS_MS = [5_000, 30_000, 120_000];

interface DependenciasAviso {
  actividades: Pick<ActividadesRepositorio, 'buscarDatosDelAviso'>;
  notificador: Notificador;
  logger: Pick<Logger, 'warn' | 'error'>;
  /** Se reemplaza en las pruebas para no esperar de verdad. */
  esperar?: (milisegundos: number) => Promise<void>;
}

/** CU11 paso 9: "Juan Pérez se unió a Volley con los tussi con 2 invitados." Sin datos sensibles (CU40 RN7). */
export function textoDelAviso(nombreParticipante: string, nombreActividad: string, cantidadInvitados: number): string {
  const base = `${nombreParticipante} se unió a ${nombreActividad}`;
  if (cantidadInvitados === 0) {
    return `${base}.`;
  }
  if (cantidadInvitados === 1) {
    return `${base} con 1 invitado.`;
  }
  return `${base} con ${cantidadInvitados} invitados.`;
}

/**
 * CU11 FP paso 9, RN13, RN14 y ER3: observador de participanteUnido que avisa al organizador por el CU40.
 * Corre después del commit y en segundo plano: lo que pase acá no cambia la incorporación (RN15).
 */
export function crearAvisoAlOrganizador(dependencias: DependenciasAviso): Observador<ParticipanteUnido> {
  const esperar = dependencias.esperar ?? esperarMilisegundos;

  return async (evento) => {
    if (evento.organizadorId === null) {
      return; // CU33: el organizador cerró su cuenta, no hay a quién avisarle
    }
    const organizadorId = evento.organizadorId;

    for (let intento = 0; intento <= ESPERAS_ENTRE_REINTENTOS_MS.length; intento++) {
      try {
        await avisar(dependencias, evento, organizadorId);
        return;
      } catch (error) {
        const quedanReintentos = intento < ESPERAS_ENTRE_REINTENTOS_MS.length;
        // ER3: se registra el error y se reintenta; la incorporación ya quedó confirmada
        dependencias.logger.error(
          { evento: 'cu11_aviso_organizador_fallido', err: error, intento: intento + 1, quedanReintentos, ...evento },
          'No se pudo generar la notificación al organizador',
        );
        if (!quedanReintentos) {
          return;
        }
        await esperar(ESPERAS_ENTRE_REINTENTOS_MS[intento]);
      }
    }
  };
}

/** Un intento: busca los nombres, respeta la actividad silenciada y crea la notificación. */
async function avisar(dependencias: DependenciasAviso, evento: ParticipanteUnido, organizadorId: string): Promise<void> {
  const datos = await dependencias.actividades.buscarDatosDelAviso(evento.actividadId, evento.usuarioId);
  if (datos === null) {
    dependencias.logger.warn(
      { evento: 'cu11_aviso_sin_datos', ...evento },
      'No se avisó al organizador: la actividad o el usuario ya no existen',
    );
    return;
  }
  // CU11 RN14 y CU40 RN3: si el organizador silenció la actividad, no se le avisa
  if (datos.organizadorSilencio) {
    return;
  }
  await dependencias.notificador.notificar(organizadorId, {
    tipo: 'participanteUnido',
    texto: textoDelAviso(datos.nombreParticipante, datos.nombreActividad, evento.cantidadInvitados),
    destino: { tipo: 'actividad', id: evento.actividadId },
  });
}

function esperarMilisegundos(milisegundos: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}
