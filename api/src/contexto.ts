import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { Config } from './config/env';
import type { Logger } from './infra/logger';
import type { VerificadorGoogle } from './infra/oauth';
import type { SesionesRepositorio } from './modulos/auth/sesiones.repositorio';

/** Dependencias compartidas que se crean una sola vez al arrancar y se pasan a cada módulo. */
export interface Contexto {
  config: Config;
  logger: Logger;
  db: Pool;
  redis: Redis;
  sesiones: SesionesRepositorio;
  verificadorGoogle: VerificadorGoogle;
}
