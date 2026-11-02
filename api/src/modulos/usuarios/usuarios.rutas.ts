import { Router } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { ActividadesRepositorio } from '../actividades/actividades.repositorio';
import { DeportesRepositorio } from '../deportes/deportes.repositorio';
import { ValoracionesRepositorio } from '../valoraciones/valoraciones.repositorio';
import { UsuariosControlador } from './usuarios.controlador';
import { UsuariosRepositorio } from './usuarios.repositorio';
import { UsuariosServicio } from './usuarios.servicio';

/** Endpoints de usuarios, montados en /api/usuarios. Todos requieren sesión (CU04 precondiciones). */
export function crearRutasUsuarios(contexto: Contexto): Router {
  const servicio = new UsuariosServicio({
    usuarios: new UsuariosRepositorio(contexto.db),
    deportes: new DeportesRepositorio(contexto.db),
    valoraciones: new ValoracionesRepositorio(contexto.db),
    actividades: new ActividadesRepositorio(contexto.db),
  });
  const controlador = new UsuariosControlador(servicio);
  const requiereSesion = crearRequiereSesion(contexto.sesiones);

  const rutas = Router();
  // Las rutas de /yo van antes que /:id para que "yo" no se tome como un id
  rutas.get('/yo', requiereSesion, controlador.obtenerUsuarioActual);
  rutas.get('/yo/perfil', requiereSesion, controlador.obtenerPerfilPropio);
  rutas.get('/yo/actividades', requiereSesion, controlador.obtenerHistorialPropio);
  rutas.get('/:id/perfil', requiereSesion, controlador.obtenerPerfilDeUsuario);
  return rutas;
}
