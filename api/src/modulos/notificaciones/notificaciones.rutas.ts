import { Router } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { NotificacionesControlador } from './notificaciones.controlador';

/** CU40 – Notificaciones, montado en /api/notificaciones. Todas las rutas requieren sesión (E3, RN6). */
export function crearRutasNotificaciones(contexto: Contexto): Router {
  const controlador = new NotificacionesControlador(contexto.notificaciones);

  const rutas = Router();
  rutas.use(crearRequiereSesion(contexto.sesiones));
  rutas.get('/', controlador.listar);
  rutas.get('/no-leidas', controlador.contarNoLeidas);
  rutas.post('/marcar-todas-leidas', controlador.marcarTodasLeidas);
  rutas.patch('/:id/leida', controlador.marcarLeida);
  rutas.delete('/:id', controlador.descartar);
  return rutas;
}
