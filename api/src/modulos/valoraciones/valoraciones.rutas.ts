import { Router } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { ValoracionesControlador } from './valoraciones.controlador';
import { ValoracionesRepositorio } from './valoraciones.repositorio';
import { ValoracionesServicio } from './valoraciones.servicio';

/**
 * CU21 – Sistema de valoración de usuarios, montado en /api/actividades/:id/valoraciones.
 * mergeParams: el id de la actividad viene de la ruta donde se monta. Todas las rutas requieren sesión.
 */
export function crearRutasValoraciones(contexto: Contexto): Router {
  const servicio = new ValoracionesServicio({
    valoraciones: new ValoracionesRepositorio(contexto.db),
    logger: contexto.logger,
  });
  const controlador = new ValoracionesControlador(servicio);

  const rutas = Router({ mergeParams: true });
  rutas.use(crearRequiereSesion(contexto.sesiones));
  rutas.get('/', controlador.listarParticipantes);
  rutas.put('/:usuarioId', controlador.valorar);
  return rutas;
}
