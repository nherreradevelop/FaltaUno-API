import { Router, type ErrorRequestHandler } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { enTransaccion } from '../../infra/postgres';
import { GastosControlador } from './gastos.controlador';
import { GastosRepositorio } from './gastos.repositorio';
import { GastosServicio } from './gastos.servicio';
import { AppError } from '../../comun/errores';
import { esquemaIdGasto } from './gastos.dto';

/** CU23–CU25: gastos. Los pagos de CU26 tienen su propio router. */
export function crearRutasGastos(contexto: Contexto): Router {
  const controlador = new GastosControlador(
    new GastosServicio({
      repositorio: new GastosRepositorio(contexto.db),
      transaccion: (operacion) => enTransaccion(contexto.db, (tx) => operacion(new GastosRepositorio(tx))),
      eventos: contexto.eventosGastos,
      alFallarAuditoria: (error, datos) =>
        contexto.logger.error(
          { evento: 'auditoria_gasto_fallida', err: error, ...datos },
          'No se pudo persistir la auditoría de una operación rechazada.',
        ),
    }),
  );
  const rutas = Router({ mergeParams: true });
  rutas.use(crearRequiereSesion(contexto.sesiones));
  rutas.get('/gastos', controlador.listar);
  rutas.get('/gastos/opciones', controlador.opciones);
  rutas.get('/gastos/:gastoId', controlador.detalle);
  rutas.post('/gastos', controlador.crear);
  rutas.put('/gastos/:gastoId', controlador.editar);
  rutas.delete('/gastos/:gastoId', controlador.eliminar);
  rutas.get('/operaciones-gastos/:clave', controlador.consultar);
  rutas.get('/balances', controlador.balances);
  // Los rechazos del borde HTTP no entraron al servicio, que audita los demás resultados.
  const auditarRechazo: ErrorRequestHandler = async (error: unknown, req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && !res.locals.gastoServicioIniciado) {
      try {
        await new GastosRepositorio(contexto.db).auditar({
          usuarioId: req.usuarioId ?? null,
          actividadId: esquemaIdGasto.safeParse(req.params.actividadId).success ? req.params.actividadId : null,
          gastoId: esquemaIdGasto.safeParse(req.params.gastoId).success ? req.params.gastoId : null,
          accion: req.method,
          fecha: new Date().toISOString(),
          resultado: 'rechazada',
          codigo: error instanceof AppError ? error.codigo : 'ERROR_INTERNO',
        });
      } catch (fallo) {
        contexto.logger.error(
          { evento: 'auditoria_rechazo_gasto_fallida', err: fallo },
          'No se pudo registrar un rechazo HTTP de gastos.',
        );
      }
    }
    next(error);
  };
  rutas.use(auditarRechazo);
  return rutas;
}
