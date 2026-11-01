import { crearApp } from './app';
import { leerConfig } from './config/env';
import type { Contexto } from './contexto';
import { logger } from './infra/logger';
import { VerificadorGoogle } from './infra/oauth';
import { crearPoolPostgres } from './infra/postgres';
import { crearClienteRedis } from './infra/redis';
import { SesionesRepositorio } from './modulos/auth/sesiones.repositorio';

/** Arranque: lee la configuración, abre las conexiones, arma el contexto y levanta el servidor. */
function iniciar(): void {
  const config = leerConfig();
  const db = crearPoolPostgres(config.POSTGRES_URL);
  const redis = crearClienteRedis(config.REDIS_URL);

  // Sin estos listeners, una caída de la base o de Redis tira abajo el proceso
  db.on('error', (error) =>
    logger.error({ evento: 'postgres_error', err: error }, 'Error en una conexión inactiva de PostgreSQL'),
  );
  redis.on('error', (error) => logger.error({ evento: 'redis_error', err: error }, 'Error de conexión con Redis'));

  const contexto: Contexto = {
    config,
    logger,
    db,
    redis,
    sesiones: new SesionesRepositorio(redis, config.SESION_DIAS),
    verificadorGoogle: new VerificadorGoogle(config.GOOGLE_CLIENT_IDS, logger),
  };

  const app = crearApp(contexto);
  app.listen(config.PUERTO, () => {
    logger.info(
      { evento: 'api_iniciada', puerto: config.PUERTO },
      `API escuchando en el puerto ${config.PUERTO} (docs en /api/docs)`,
    );
  });
}

iniciar();
