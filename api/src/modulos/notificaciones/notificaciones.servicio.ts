import { errores } from '../../comun/errores';
import type { AvisadorEnVivo } from '../../infra/tiempo-real';
import { aNotificacionDto, type CantidadNoLeidas, type NotificacionDto, type PaginaNotificaciones } from './notificaciones.dto';
import type { DatosNotificacionNueva, NotificacionesRepositorio } from './notificaciones.repositorio';

/** CU40 FP paso 3 y A2: las notificaciones se muestran de a 20. */
export const NOTIFICACIONES_POR_PAGINA = 20;

/** RN8 / RNF-16: días que se conservan las notificaciones (acordado con el equipo). */
export const DIAS_DE_RETENCION = 30;

/** Eventos del canal en tiempo real (CU40 A3). Los clientes los escuchan con estos mismos nombres. */
export const EVENTOS_EN_VIVO = {
  /** Llegó una notificación nueva: { notificacion, noLeidas } */
  nueva: 'notificaciones:nueva',
  /** Cambió la cantidad sin leer (por ejemplo, se leyó en otro dispositivo): { cantidad } */
  noLeidas: 'notificaciones:no-leidas',
} as const;

type Repositorio = Pick<NotificacionesRepositorio, 'listar' | 'contarNoLeidas' | 'marcarLeida' | 'marcarTodasLeidas' | 'crear'>;

/** CU40 – Notificaciones. */
export class NotificacionesServicio {
  constructor(
    private readonly repositorio: Repositorio,
    private readonly enVivo: AvisadorEnVivo,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  /** FP paso 3 y A2: una página de notificaciones del usuario, de la más reciente a la más antigua. */
  async listar(usuarioId: string, antesDe: string | null): Promise<PaginaNotificaciones> {
    // Se pide una de más para saber si hay otra página sin hacer otra consulta
    const encontradas = await this.repositorio.listar(usuarioId, antesDe, NOTIFICACIONES_POR_PAGINA + 1);
    const hayMas = encontradas.length > NOTIFICACIONES_POR_PAGINA;
    const pagina = encontradas.slice(0, NOTIFICACIONES_POR_PAGINA);
    return { notificaciones: pagina.map(aNotificacionDto), hayMas };
  }

  /** FP paso 1 y RN4: cantidad de notificaciones sin leer, para el indicador. */
  async contarNoLeidas(usuarioId: string): Promise<CantidadNoLeidas> {
    return { cantidad: await this.repositorio.contarNoLeidas(usuarioId) };
  }

  /** FP paso 6, A5 y RN5: marca como leída una notificación propia (al abrirla o sin abrirla). */
  async marcarLeida(usuarioId: string, id: string): Promise<CantidadNoLeidas> {
    const existe = await this.repositorio.marcarLeida(usuarioId, id);
    if (!existe) {
      // RN6: la de otro usuario responde igual que una inexistente, para no revelar que existe
      throw errores.noEncontrado('NOTIFICACION_NO_ENCONTRADA', 'La notificación ya no está disponible.');
    }
    return this.avisarCantidadNoLeidas(usuarioId);
  }

  /** A1: marca como leídas todas las recibidas hasta el momento en que el usuario lo pidió. */
  async marcarTodasLeidas(usuarioId: string, hasta: Date): Promise<CantidadNoLeidas> {
    await this.repositorio.marcarTodasLeidas(usuarioId, hasta);
    return this.avisarCantidadNoLeidas(usuarioId);
  }

  /**
   * Crea una notificación y la avisa en tiempo real (A3). La llaman los casos de uso que notifican,
   * siempre después de confirmar su propia operación.
   * Pendiente: CU06, CU12, CU13, CU17, CU21, CU29, CU31, CU32, CU36 y CU38 (como observadores de sus eventos).
   */
  async notificar(usuarioId: string, datos: DatosNotificacionNueva): Promise<NotificacionDto> {
    const creada = await this.repositorio.crear(usuarioId, datos, this.reloj());
    const notificacion = aNotificacionDto(creada);
    const noLeidas = await this.repositorio.contarNoLeidas(usuarioId);
    this.enVivo.emitirAUsuario(usuarioId, EVENTOS_EN_VIVO.nueva, { notificacion, noLeidas });
    return notificacion;
  }

  /** ER2: el indicador solo cambia con lo que la base confirmó; se avisa a los demás dispositivos del usuario. */
  private async avisarCantidadNoLeidas(usuarioId: string): Promise<CantidadNoLeidas> {
    const cantidad = await this.repositorio.contarNoLeidas(usuarioId);
    this.enVivo.emitirAUsuario(usuarioId, EVENTOS_EN_VIVO.noLeidas, { cantidad });
    return { cantidad };
  }
}
