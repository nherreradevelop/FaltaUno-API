import { Router } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { ActividadesControlador } from './actividades.controlador';
import { ActividadesRepositorio } from './actividades.repositorio';
import { ActividadesServicio } from './actividades.servicio';

/**
 * Endpoints de actividades, montados en /api/actividades.
 * Todos requieren sesión (CU08 ER3, CU09 precondición 1 y RN6): sin sesión responden 401 y el cliente lleva al login.
 */
export function crearRutasActividades(contexto: Contexto): Router {
  const servicio = new ActividadesServicio({ actividades: new ActividadesRepositorio(contexto.db) });
  const controlador = new ActividadesControlador(servicio);
  const requiereSesion = crearRequiereSesion(contexto.sesiones);

  const rutas = Router();
  rutas.get('/', requiereSesion, controlador.buscar);
  // Antes que /:id: si no, "departamentos" se tomaría como el id de una actividad
  rutas.get('/departamentos', requiereSesion, controlador.listarDepartamentos);
  rutas.get('/:id', requiereSesion, controlador.obtenerDetalle);
  rutas.get('/:id/participantes', requiereSesion, controlador.obtenerParticipantes);
  return rutas;
}
