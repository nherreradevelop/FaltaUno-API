import { Router } from 'express';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import { limitarIntentos } from '../../comun/middlewares/limitarIntentos';
import type { Contexto } from '../../contexto';
import { GoogleMaps } from '../../infra/google-maps';
import { GoogleGeocoding } from '../../infra/google-geocoding';
import { enTransaccion } from '../../infra/postgres';
import { ActividadesControlador } from './actividades.controlador';
import { ActividadesRepositorio } from './actividades.repositorio';
import { ActividadesServicio } from './actividades.servicio';
import { IdempotenciaRepositorio } from './idempotencia.repositorio';
import { crearDestinoProvisional } from './destino-provisional';

/** Montado en /api/actividades, con sesión válida en todos los endpoints. */
export function crearRutasActividades(contexto: Contexto): Router {
  const { config } = contexto;
  const servicio = new ActividadesServicio({
    repositorio: new ActividadesRepositorio(contexto.db),
    transaccion: (operacion) => enTransaccion(contexto.db, (tx) => operacion(new ActividadesRepositorio(tx))),
    mapas: new GoogleMaps(config.GOOGLE_MAPS_API_KEY, config.GOOGLE_MAPS_TIMEOUT_MS, fetch, contexto.logger),
    puntos: new GoogleGeocoding(config.GOOGLE_MAPS_API_KEY, config.GOOGLE_MAPS_TIMEOUT_MS, fetch, contexto.logger),
    idempotencia: new IdempotenciaRepositorio(contexto.redis, config.IDEMPOTENCIA_HORAS),
    maximoParticipantes: config.ACTIVIDAD_MAX_PARTICIPANTES,
    destinoProvisional: crearDestinoProvisional({
      lat: config.ACTIVIDAD_DESTINO_PROVISIONAL_LAT,
      lng: config.ACTIVIDAD_DESTINO_PROVISIONAL_LNG,
      departamento: config.ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO,
    }),
    sesiones: contexto.sesiones,
  });
  const controlador = new ActividadesControlador(servicio);
  const rutas = Router();
  rutas.use(crearRequiereSesion(contexto.sesiones));
  rutas.get('/opciones', controlador.opciones);
  const limiteMapas = limitarIntentos(contexto.redis, 'mapas', {
    maximo: config.LIMITE_MAPAS_SOLICITUDES_MINUTO,
    ventanaEnMinutos: 1,
  });
  rutas.get('/ubicaciones', limiteMapas, controlador.buscarUbicaciones);
  rutas.get('/ubicaciones/punto', limiteMapas, controlador.resolverPunto);
  rutas.get('/ubicaciones/detalle', limiteMapas, controlador.detalleUbicacion);
  rutas.post('/', limiteMapas, controlador.crear);
  return rutas;
}
