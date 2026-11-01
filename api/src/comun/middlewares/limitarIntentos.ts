import type { NextFunction, Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { errores } from '../errores';

export interface LimiteDeSolicitudes {
  maximo: number;
  ventanaEnMinutos: number;
}

/**
 * RNF-11: limita la cantidad de solicitudes de una misma IP a un grupo de endpoints sensibles.
 * Ventana fija: el contador arranca con la primera solicitud y vence al terminar la ventana.
 */
export function limitarIntentos(redis: Redis, grupo: string, limite: LimiteDeSolicitudes) {
  const segundosDeVentana = limite.ventanaEnMinutos * 60;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const clave = `limite:${grupo}:${req.ip}`;
    const solicitudes = await redis.incr(clave);
    if (solicitudes === 1) {
      await redis.expire(clave, segundosDeVentana);
    }

    if (solicitudes > limite.maximo) {
      throw errores.demasiadosIntentos(
        'DEMASIADAS_SOLICITUDES',
        'Hiciste demasiados intentos. Esperá unos minutos y probá de nuevo.',
      );
    }
    next();
  };
}
