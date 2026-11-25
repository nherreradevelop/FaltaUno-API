import { iniciarRetencionPagos } from './modulos/pagos/pagos-retencion';
import { createServer } from 'node:http';
import { crearApp } from './app';
import { leerConfig } from './config/env';
import type { Contexto } from './contexto';
import { logger } from './infra/logger';
import { crearClienteMongo } from './infra/mongo';
import { VerificadorGoogle } from './infra/oauth';
import { crearPoolPostgres } from './infra/postgres';
import { crearClienteRedis } from './infra/redis';
import { TiempoReal } from './infra/tiempo-real';
import { crearEventosDeActividades } from './modulos/actividades/actividades.eventos';
import { ActividadesRepositorio } from './modulos/actividades/actividades.repositorio';
import { SesionesRepositorio } from './modulos/auth/sesiones.repositorio';
import { NotificacionesRepositorio } from './modulos/notificaciones/notificaciones.repositorio';
import { DIAS_DE_RETENCION, NotificacionesServicio } from './modulos/notificaciones/notificaciones.servicio';
import { Observable } from './comun/observable';
import type { EventoGasto } from './modulos/gastos/gastos.eventos';
import { AuditoriaObservador } from './modulos/auditoria/auditoria.observador';
import { conectarSuscripciones, conectarSuscripcionesDeGastos, conectarActualizacionesFinancieras } from './suscripciones';
import { GastosNotificacionesObservador } from './modulos/gastos/gastos-notificaciones.observador';
import type { EventoPago } from './modulos/pagos/pagos.eventos';
import { FinanzasTiempoRealObservador } from './modulos/gastos/finanzas-tiempo-real.observador';
import { FinanzasTiempoRealRepositorio } from './modulos/gastos/finanzas-tiempo-real.repositorio';

/** Arranque: lee la configuración, abre las conexiones, arma el contexto, conecta las suscripciones y levanta el servidor. */
function iniciar(): void {
  const config = leerConfig();
  const db = crearPoolPostgres(config.POSTGRES_URL);
  const redis = crearClienteRedis(config.REDIS_URL);
  const mongo = crearClienteMongo(config.MONGO_URL, config.MONGO_DB);

  // Sin estos listeners, una caída de la base o de Redis tira abajo el proceso
  db.on('error', (error) =>
    logger.error({ evento: 'postgres_error', err: error }, 'Error en una conexión inactiva de PostgreSQL'),
  );
  redis.on('error', (error) => logger.error({ evento: 'redis_error', err: error }, 'Error de conexión con Redis'));

  const sesiones = new SesionesRepositorio(redis, config.SESION_DIAS);
  const eventosGastos = new Observable<EventoGasto>((error, evento) =>
    logger.error({ err: error, evento }, 'Falló un observador de gastos.'),
  );
  const eventosPagos = new Observable<EventoPago>((error, evento) =>
    logger.error({ err: error, evento }, 'Falló un observador de pagos.'),
  );

  // El servidor HTTP se crea antes que la app: Socket.IO (CU40 A3) comparte el puerto de la API
  const servidor = createServer();
  const tiempoReal = TiempoReal.iniciar(servidor, { origenes: config.CORS_ORIGENES, sesiones, logger });

  const repositorioNotificaciones = new NotificacionesRepositorio(mongo.db);
  // Si MongoDB no está disponible al arrancar, la API sigue: se reintenta en el próximo arranque
  repositorioNotificaciones
    .crearIndices(DIAS_DE_RETENCION)
    .catch((error: unknown) =>
      logger.error({ evento: 'mongo_indices', err: error }, 'No se pudieron crear los índices de notificaciones'),
    );

  const notificaciones = new NotificacionesServicio(repositorioNotificaciones, tiempoReal);
  const desconectarFinanzas = conectarActualizacionesFinancieras(
    eventosGastos,
    eventosPagos,
    new FinanzasTiempoRealObservador(new FinanzasTiempoRealRepositorio(db), tiempoReal),
  );
  const desconectarGastos = conectarSuscripcionesDeGastos(
    eventosGastos,
    new AuditoriaObservador(db, mongo.db),
    logger,
    new GastosNotificacionesObservador(db, notificaciones),
  );

  const detenerRetencion = iniciarRetencionPagos(db, logger);

  const contexto: Contexto = {
    config,
    logger,
    db,
    redis,
    mongo: mongo.db,
    sesiones,
    eventosGastos,
    eventosPagos,
    verificadorGoogle: new VerificadorGoogle(config.GOOGLE_CLIENT_IDS, logger),
    notificaciones,
    eventosActividades: crearEventosDeActividades(logger),
  };
  // Las suscripciones viven lo mismo que el proceso: no hace falta desuscribirlas al apagar
  conectarSuscripciones({
    eventosActividades: contexto.eventosActividades,
    logger,
    actividades: new ActividadesRepositorio(db),
    // CU11 paso 9: avisa al organizador por el CU40
    notificador: contexto.notificaciones,
  });

  servidor.once('close', detenerRetencion);
  process.once('SIGTERM', detenerRetencion);
  process.once('SIGINT', detenerRetencion);
  servidor.on('request', crearApp(contexto));
  servidor.once('close', desconectarGastos);
  servidor.once('close', desconectarFinanzas);
  process.once('SIGTERM', desconectarFinanzas);
  process.once('SIGINT', desconectarFinanzas);
  process.once('SIGTERM', desconectarGastos);
  process.once('SIGINT', desconectarGastos);
  servidor.listen(config.PUERTO, () => {
    logger.info(
      { evento: 'api_iniciada', puerto: config.PUERTO },
      `API escuchando en el puerto ${config.PUERTO} (docs en /api/docs)`,
    );
  });
}

iniciar();
