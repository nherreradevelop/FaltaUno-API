import { Router } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { DeportesControlador } from './deportes.controlador';
import { DeportesRepositorio } from './deportes.repositorio';
import { DeportesServicio } from './deportes.servicio';

/** Catálogo de deportes, montado en /api/deportes. */
export function crearRutasDeportes(contexto: Contexto): Router {
  const controlador = new DeportesControlador(new DeportesServicio(new DeportesRepositorio(contexto.db)));
  const requiereSesion = crearRequiereSesion(contexto.sesiones);

  const rutas = Router();
  rutas.get('/', requiereSesion, controlador.listarActivos);
  return rutas;
}
