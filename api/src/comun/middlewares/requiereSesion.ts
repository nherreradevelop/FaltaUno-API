import type { NextFunction, Request, Response } from 'express';
import type { SesionesRepositorio } from '../../modulos/auth/sesiones.repositorio';
import { errores } from '../errores';

const PREFIJO_BEARER = 'Bearer ';

/** RNF-13: valida que la sesión exista y esté vigente antes de cada operación privada. */
export function crearRequiereSesion(sesiones: Pick<SesionesRepositorio, 'buscarUsuarioId'>) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const encabezado = req.headers.authorization ?? '';
    const token = encabezado.startsWith(PREFIJO_BEARER) ? encabezado.slice(PREFIJO_BEARER.length) : '';

    const usuarioId = token ? await sesiones.buscarUsuarioId(token) : null;
    if (usuarioId === null) {
      throw errores.noAutenticado('SESION_INVALIDA', 'Tu sesión venció. Iniciá sesión de nuevo.');
    }

    req.usuarioId = usuarioId;
    next();
  };
}
