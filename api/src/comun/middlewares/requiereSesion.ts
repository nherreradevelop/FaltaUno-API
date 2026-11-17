import type { NextFunction, Request, Response } from 'express';
import type { SesionesRepositorio } from '../../modulos/auth/sesiones.repositorio';
import { errores } from '../errores';

const PREFIJO_BEARER = 'Bearer ';

/** Token del encabezado "Authorization: Bearer <token>", o null si no viene. */
export function leerTokenBearer(req: Request): string | null {
  const encabezado = req.headers.authorization ?? '';
  if (!encabezado.startsWith(PREFIJO_BEARER)) {
    return null;
  }
  const token = encabezado.slice(PREFIJO_BEARER.length);
  return token || null;
}

/** RNF-13: valida que la sesión exista y esté vigente antes de cada operación privada. */
export function crearRequiereSesion(sesiones: Pick<SesionesRepositorio, 'buscarUsuarioId'>) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = leerTokenBearer(req);
    const usuarioId = token ? await sesiones.buscarUsuarioId(token) : null;
    if (usuarioId === null) {
      throw errores.noAutenticado('SESION_INVALIDA', 'Tu sesión venció. Iniciá sesión de nuevo.');
    }

    req.usuarioId = usuarioId;
    next();
  };
}
