import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';

/** El correo se guarda como hash para no dejar datos personales en Redis. */
function hashDeEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/**
 * CU01 E4 para correos que NO corresponden a ninguna cuenta.
 * Las cuentas existentes se bloquean en PostgreSQL (usuario.bloqueado_hasta); estos correos se bloquean acá
 * con los mismos límites, para que la respuesta sea idéntica y no revele si el correo está registrado (RNF-12).
 */
export class BloqueosRepositorio {
  constructor(private readonly redis: Redis) {}

  /** Devuelve los minutos que faltan para que termine el bloqueo, o 0 si no está bloqueado. */
  async minutosDeBloqueoRestantes(email: string): Promise<number> {
    const segundosRestantes = await this.redis.ttl(`login:bloqueo:${hashDeEmail(email)}`);
    if (segundosRestantes <= 0) {
      return 0;
    }
    return Math.ceil(segundosRestantes / 60);
  }

  /**
   * Suma un intento fallido; al llegar al máximo bloquea el correo y reinicia el contador.
   * El contador vence junto con el bloqueo, porque no hay un ingreso correcto que lo reinicie.
   * Devuelve true si el correo quedó bloqueado.
   */
  async registrarIntentoFallido(email: string, maximoIntentos: number, minutosDeBloqueo: number): Promise<boolean> {
    const hash = hashDeEmail(email);
    const claveIntentos = `login:intentos:${hash}`;
    const segundosDeBloqueo = minutosDeBloqueo * 60;

    const intentos = await this.redis.incr(claveIntentos);
    await this.redis.expire(claveIntentos, segundosDeBloqueo);

    if (intentos < maximoIntentos) {
      return false;
    }
    await this.redis.multi().set(`login:bloqueo:${hash}`, '1', 'EX', segundosDeBloqueo).del(claveIntentos).exec();
    return true;
  }
}
