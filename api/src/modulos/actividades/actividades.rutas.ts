import { Router } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { ActividadesControlador } from './actividades.controlador';
import { ActividadesRepositorio } from './actividades.repositorio';
import { ActividadesServicio } from './actividades.servicio';

/** Endpoints de actividades, montados en /api/actividades. Todos requieren sesión (CU08 precondiciones, ER3). */
export function crearRutasActividades(contexto: Contexto): Router {
  const servicio = new ActividadesServicio({ actividades: new ActividadesRepositorio(contexto.db) });
  const controlador = new ActividadesControlador(servicio);
  const requiereSesion = crearRequiereSesion(contexto.sesiones);

  const rutas = Router();
  rutas.get('/', requiereSesion, controlador.buscar);
  rutas.get('/departamentos', requiereSesion, controlador.listarDepartamentos);
  return rutas;
}
