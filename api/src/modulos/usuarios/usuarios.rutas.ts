import { Router } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { UsuariosControlador } from './usuarios.controlador';
import { UsuariosRepositorio } from './usuarios.repositorio';
import { UsuariosServicio } from './usuarios.servicio';

/** Endpoints de usuarios, montados en /api/usuarios. */
export function crearRutasUsuarios(contexto: Contexto): Router {
  const controlador = new UsuariosControlador(new UsuariosServicio(new UsuariosRepositorio(contexto.db)));
  const requiereSesion = crearRequiereSesion(contexto.sesiones);

  const rutas = Router();
  rutas.get('/yo', requiereSesion, controlador.obtenerUsuarioActual);
  return rutas;
}
