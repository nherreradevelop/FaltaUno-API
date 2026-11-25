import { AppError } from '../../comun/errores';
import { esquemaIdGasto } from '../gastos/gastos.dto';
import { Router, type ErrorRequestHandler } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { enTransaccion } from '../../infra/postgres';
import { PagosControlador } from './pagos.controlador';
import { PagosRepositorio } from './pagos.repositorio';
import { PagosServicio } from './pagos.servicio';

/** CU26, CU24 y CU25: todas las rutas requieren sesión y autorización del servicio. */
export function crearRutasPagos(contexto: Contexto): Router {
  const controlador = new PagosControlador(
    new PagosServicio({
      repositorio: new PagosRepositorio(contexto.db),
      eventos: contexto.eventosPagos,
      transaccion: (operacion) => enTransaccion(contexto.db, (tx) => operacion(new PagosRepositorio(tx))),
      alFallarAuditoria: (err) =>
        contexto.logger.error({ err, evento: 'auditoria_pago_fallida' }, 'No se pudo auditar un pago rechazado.'),
    }),
  );
  const rutas = Router({ mergeParams: true });
  rutas.use(crearRequiereSesion(contexto.sesiones));
  rutas.get('/pagos', controlador.listar);
  rutas.get('/pagos/opciones', controlador.opciones);
  rutas.get('/pagos/:pagoId', controlador.detalle);
  rutas.post('/pagos', controlador.crear);
  rutas.put('/pagos/:pagoId', controlador.editar);
  rutas.delete('/pagos/:pagoId', controlador.eliminar);
  rutas.get('/operaciones-pagos/:clave', controlador.consultar);
  const auditarRechazo: ErrorRequestHandler = async (error: unknown, req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && !res.locals.pagoServicioIniciado) {
      try {
        await new PagosRepositorio(contexto.db).gastos.auditar({
          tipo: 'pago',
          accion: req.method,
          usuarioId: req.usuarioId ?? null,
          actividadId: esquemaIdGasto.safeParse(req.params.actividadId).success ? req.params.actividadId : null,
          pagoId: esquemaIdGasto.safeParse(req.params.pagoId).success ? req.params.pagoId : null,
          fecha: new Date().toISOString(),
          resultado: 'rechazada',
          codigo: error instanceof AppError ? error.codigo : 'ERROR_INTERNO',
        });
      } catch (err) {
        contexto.logger.error({ err, evento: 'auditoria_rechazo_pago_fallida' }, 'No se pudo auditar un rechazo HTTP de pagos.');
      }
    }
    next(error);
  };
  rutas.use(auditarRechazo);
  return rutas;
}
