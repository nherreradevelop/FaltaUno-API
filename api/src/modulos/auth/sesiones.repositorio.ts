import { createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';

export interface SesionCreada {
  token: string;
  venceEn: Date;
}

/** En Redis se guarda el hash del token, nunca el token: si alguien lee Redis no puede usar las sesiones. */
function hashDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function claveSesion(tokenHash: string): string {
  return `sesion:${tokenHash}`;
}

/** Conjunto con las sesiones de un usuario, para poder cerrarlas todas juntas (RNF-13, CU01 RN6). */
function claveSesionesDeUsuario(usuarioId: string): string {
  return `sesiones_usuario:${usuarioId}`;
}

/** Sesiones opacas en Redis con vencimiento (CU01 RN4). */
export class SesionesRepositorio {
  constructor(
    private readonly redis: Redis,
    private readonly duracionEnDias: number,
  ) {}

  async crear(usuarioId: string): Promise<SesionCreada> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashDeToken(token);
    const duracionEnSegundos = this.duracionEnDias * 24 * 60 * 60;

    await this.redis
      .multi()
      .set(claveSesion(tokenHash), usuarioId, 'EX', duracionEnSegundos)
      .sadd(claveSesionesDeUsuario(usuarioId), tokenHash)
      .expire(claveSesionesDeUsuario(usuarioId), duracionEnSegundos)
      .exec();

    const venceEn = new Date(Date.now() + duracionEnSegundos * 1000);
    return { token, venceEn };
  }

  /** Devuelve el id del usuario dueño de la sesión, o null si no existe o ya venció. */
  async buscarUsuarioId(token: string): Promise<string | null> {
    return this.redis.get(claveSesion(hashDeToken(token)));
  }

  /** Cierra todas las sesiones abiertas del usuario. */
  async cerrarTodas(usuarioId: string): Promise<void> {
    const claveConjunto = claveSesionesDeUsuario(usuarioId);
    const hashes = await this.redis.smembers(claveConjunto);
    const clavesABorrar = [...hashes.map(claveSesion), claveConjunto];
    await this.redis.del(...clavesABorrar);
  }
}
