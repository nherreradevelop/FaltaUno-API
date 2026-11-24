import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import type { Pool } from 'pg';
import type { Config } from './config/env';
import type { Logger } from './infra/logger';
import type { VerificadorGoogle } from './infra/oauth';
import type { SesionesRepositorio } from './modulos/auth/sesiones.repositorio';
import type { NotificacionesServicio } from './modulos/notificaciones/notificaciones.servicio';
import type { Observable } from './comun/observable';
import type { EventoGasto } from './modulos/gastos/gastos.eventos';
import type { EventoPago } from './modulos/pagos/pagos.eventos';

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
  eventosGastos?: Observable<EventoGasto>;
  eventosPagos?: Observable<EventoPago>;
}
