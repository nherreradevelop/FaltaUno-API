import { Redis } from 'ioredis';

// RNF-08: sin cola offline ni reintentos infinitos; si Redis no está, el comando falla rápido
const TIEMPO_COMANDO_MS = 3_000;

export function crearClienteRedis(url: string): Redis {
  return new Redis(url, {
    commandTimeout: TIEMPO_COMANDO_MS,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}
