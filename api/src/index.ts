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
import { SesionesRepositorio } from './modulos/auth/sesiones.repositorio';
import { NotificacionesRepositorio } from './modulos/notificaciones/notificaciones.repositorio';
import { DIAS_DE_RETENCION, NotificacionesServicio } from './modulos/notificaciones/notificaciones.servicio';

/** Arranque: lee la configuración, abre las conexiones, arma el contexto y levanta el servidor. */
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

  const contexto: Contexto = {
    config,
    logger,
    db,
    redis,
    mongo: mongo.db,
    sesiones,
    verificadorGoogle: new VerificadorGoogle(config.GOOGLE_CLIENT_IDS, logger),
    notificaciones: new NotificacionesServicio(repositorioNotificaciones, tiempoReal),
  };

  servidor.on('request', crearApp(contexto));
  servidor.listen(config.PUERTO, () => {
    logger.info(
      { evento: 'api_iniciada', puerto: config.PUERTO },
      `API escuchando en el puerto ${config.PUERTO} (docs en /api/docs)`,
    );
  });
}

iniciar();
