import { Router } from 'express';
import { limitarIntentos } from '../../comun/middlewares/limitarIntentos';
import { crearRequiereSesion } from '../../comun/middlewares/requiereSesion';
import type { Contexto } from '../../contexto';
import { GoogleGeocoding } from '../../infra/google-geocoding';
import { GoogleMaps } from '../../infra/google-maps';
import { enTransaccion } from '../../infra/postgres';
import { ActividadesControlador } from './actividades.controlador';
import { ActividadesRepositorio } from './actividades.repositorio';
import { ActividadesServicio } from './actividades.servicio';
import { CrearActividadServicio } from './crear-actividad.servicio';
import { crearDestinoProvisional } from './destino-provisional';
import { IdempotenciaRepositorio } from './idempotencia.repositorio';

/**
 * Endpoints de actividades, montados en /api/actividades.
 * Todos requieren sesión (CU08 ER3, CU09 precondición 1 y RN6, CU10): sin sesión responden 401 y el cliente lleva al login.
 */
export function crearRutasActividades(contexto: Contexto): Router {
  const { config } = contexto;
  const repositorio = new ActividadesRepositorio(contexto.db);
  const servicio = new ActividadesServicio({ actividades: repositorio });
  const creacion = new CrearActividadServicio({
    repositorio,
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
  const controlador = new ActividadesControlador(servicio, creacion);
  const limiteMapas = limitarIntentos(contexto.redis, 'mapas', {
    maximo: config.LIMITE_MAPAS_SOLICITUDES_MINUTO,
    ventanaEnMinutos: 1,
  });

  const rutas = Router();
  rutas.use(crearRequiereSesion(contexto.sesiones));
  rutas.get('/', controlador.buscar); // CU08
  rutas.post('/', limiteMapas, controlador.crear); // CU10
  // Las rutas con nombre fijo van antes que /:id: si no, "departamentos" u "opciones" se tomarían como el id de una actividad
  rutas.get('/departamentos', controlador.listarDepartamentos); // CU08 A5
  rutas.get('/opciones', controlador.opciones); // CU10
  rutas.get('/ubicaciones', limiteMapas, controlador.buscarUbicaciones); // CU10
  rutas.get('/ubicaciones/punto', limiteMapas, controlador.resolverPunto); // CU10
  rutas.get('/ubicaciones/detalle', limiteMapas, controlador.detalleUbicacion); // CU10
  rutas.get('/:id', controlador.obtenerDetalle); // CU09
  rutas.get('/:id/participantes', controlador.obtenerParticipantes); // CU09
  return rutas;
}
