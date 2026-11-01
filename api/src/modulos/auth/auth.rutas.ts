import { Router } from 'express';
import { limitarIntentos } from '../../comun/middlewares/limitarIntentos';
import type { Contexto } from '../../contexto';
import { UsuariosRepositorio } from '../usuarios/usuarios.repositorio';
import { AuthControlador } from './auth.controlador';
import { AuthServicio } from './auth.servicio';
import { BloqueosRepositorio } from './bloqueos.repositorio';

/** Endpoints de autenticación, montados en /api/auth. */
export function crearRutasAuth(contexto: Contexto): Router {
  const { config } = contexto;
  const servicio = new AuthServicio({
    usuarios: new UsuariosRepositorio(contexto.db),
    sesiones: contexto.sesiones,
    bloqueos: new BloqueosRepositorio(contexto.redis),
    verificadorGoogle: contexto.verificadorGoogle,
    logger: contexto.logger,
    maximoIntentos: config.LOGIN_MAX_INTENTOS,
    minutosDeBloqueo: config.LOGIN_BLOQUEO_MINUTOS,
  });
  const controlador = new AuthControlador(servicio);

  const limiteAuth = limitarIntentos(contexto.redis, 'auth', {
    maximo: config.LIMITE_AUTH_SOLICITUDES,
    ventanaEnMinutos: config.LIMITE_AUTH_VENTANA_MINUTOS,
  });

  const rutas = Router();
  rutas.post('/login', limiteAuth, controlador.iniciarSesion);
  rutas.post('/google', limiteAuth, controlador.iniciarSesionConGoogle);
  return rutas;
}
