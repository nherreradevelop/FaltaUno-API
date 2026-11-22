import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import type { Pool } from 'pg';
import type { Config } from './config/env';
import type { Logger } from './infra/logger';
import type { VerificadorGoogle } from './infra/oauth';
import type { EventosDeActividades } from './modulos/actividades/actividades.eventos';
import type { SesionesRepositorio } from './modulos/auth/sesiones.repositorio';
import type { NotificacionesServicio } from './modulos/notificaciones/notificaciones.servicio';

/** Dependencias compartidas que se crean una sola vez al arrancar y se pasan a cada módulo. */
export interface Contexto {
  config: Config;
  logger: Logger;
  db: Pool;
  redis: Redis;
  mongo: Db;
  sesiones: SesionesRepositorio;
  verificadorGoogle: VerificadorGoogle;
  /** CU40: los casos de uso que notifican lo usan para crear y avisar notificaciones. */
  notificaciones: NotificacionesServicio;
  /** Eventos de dominio de actividades (CU11). Sus observadores se conectan en suscripciones.ts. */
  eventosActividades: EventosDeActividades;
}
