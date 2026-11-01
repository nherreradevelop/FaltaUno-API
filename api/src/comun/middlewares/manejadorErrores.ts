import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../../infra/logger';
import { AppError } from '../errores';

/**
 * Único lugar donde los errores se convierten en respuesta HTTP.
 * Los errores esperados (AppError) responden con su estado; los inesperados se registran
 * en el log y responden 500 sin detalles internos (RNF-09, RNF-12).
 */
export function crearManejadorErrores(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (error instanceof AppError) {
      res.status(error.estado).json({ error: { codigo: error.codigo, mensaje: error.message, campos: error.campos } });
      return;
    }

    // Cuerpo JSON mal formado: lo detecta express.json() antes de llegar al controlador
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es un JSON válido.' } });
      return;
    }

    logger.error(
      { evento: 'error_inesperado', err: error, metodo: req.method, ruta: req.originalUrl },
      'Error no controlado en la API',
    );
    res.status(500).json({
      error: { codigo: 'ERROR_INTERNO', mensaje: 'No pudimos completar la operación en este momento. Probá más tarde.' },
    });
  };
}
