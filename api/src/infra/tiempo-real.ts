import type { Server as ServidorHttp } from 'node:http';
import { Server } from 'socket.io';
import type { SesionesRepositorio } from '../modulos/auth/sesiones.repositorio';
import type { Logger } from './logger';

/** Lo único que los módulos necesitan del canal en tiempo real: avisarle algo a un usuario. */
export interface AvisadorEnVivo {
  emitirAUsuario(usuarioId: string, evento: string, datos: unknown): void;
}

/** Cada usuario conectado entra a su propia sala; un mismo usuario puede tener varias conexiones (web y celular). */
function salaDeUsuario(usuarioId: string): string {
  return `usuario:${usuarioId}`;
}

/**
 * RNF-13: la conexión se acepta solo con una sesión vigente, igual que requiereSesion en HTTP.
 * Devuelve el id del usuario, o null si el token no vino o la sesión no existe.
 */
export async function autenticarConexion(
  token: unknown,
  sesiones: Pick<SesionesRepositorio, 'buscarUsuarioId'>,
): Promise<string | null> {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }
  return sesiones.buscarUsuarioId(token);
}

interface OpcionesTiempoReal {
  origenes: string[];
  sesiones: Pick<SesionesRepositorio, 'buscarUsuarioId'>;
  logger: Logger;
}

/** Canal en tiempo real con Socket.IO, sobre el mismo servidor HTTP de la API (CU40 A3). */
export class TiempoReal implements AvisadorEnVivo {
  private constructor(private readonly io: Server) {}

  static iniciar(servidorHttp: ServidorHttp, opciones: OpcionesTiempoReal): TiempoReal {
    // CORS solo aplica a navegadores (web y Expo web); la app nativa no envía Origin
    const io = new Server(servidorHttp, { cors: { origin: opciones.origenes }, serveClient: false });

    io.use((socket, siguiente) => {
      autenticarConexion(socket.handshake.auth?.token, opciones.sesiones)
        .then((usuarioId) => {
          if (usuarioId === null) {
            siguiente(new Error('SESION_INVALIDA'));
            return;
          }
          socket.data.usuarioId = usuarioId;
          siguiente();
        })
        .catch((error: unknown) => {
          opciones.logger.error({ evento: 'tiempo_real_autenticacion', err: error }, 'No se pudo validar la sesión del socket');
          siguiente(new Error('ERROR_INTERNO'));
        });
    });

    io.on('connection', (socket) => {
      const usuarioId = socket.data.usuarioId as string;
      void socket.join(salaDeUsuario(usuarioId));
    });

    return new TiempoReal(io);
  }

  emitirAUsuario(usuarioId: string, evento: string, datos: unknown): void {
    this.io.to(salaDeUsuario(usuarioId)).emit(evento, datos);
  }
}
