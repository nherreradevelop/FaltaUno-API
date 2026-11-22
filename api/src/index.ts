import { crearApp } from './app';
import { leerConfig } from './config/env';
import type { Contexto } from './contexto';
import { logger } from './infra/logger';
import { VerificadorGoogle } from './infra/oauth';
import { crearPoolPostgres } from './infra/postgres';
import { crearClienteRedis } from './infra/redis';
import { crearEventosDeActividades } from './modulos/actividades/actividades.eventos';
import { ActividadesRepositorio } from './modulos/actividades/actividades.repositorio';
import { SesionesRepositorio } from './modulos/auth/sesiones.repositorio';
import { conectarSuscripciones } from './suscripciones';

/** Arranque: lee la configuración, abre las conexiones, arma el contexto, conecta las suscripciones y levanta el servidor. */
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
    eventosActividades: crearEventosDeActividades(logger),
  };
  // Las suscripciones viven lo mismo que el proceso: no hace falta desuscribirlas al apagar
  conectarSuscripciones({
    eventosActividades: contexto.eventosActividades,
    logger,
    actividades: new ActividadesRepositorio(db),
    // Pendiente: CU40 – pasar contexto.notificaciones cuando el PR del CU40 entre a develop (CU11 paso 9)
    notificador: null,
  });

  const app = crearApp(contexto);
  app.listen(config.PUERTO, () => {
    logger.info(
      { evento: 'api_iniciada', puerto: config.PUERTO },
      `API escuchando en el puerto ${config.PUERTO} (docs en /api/docs)`,
    );
  });
}

iniciar();
