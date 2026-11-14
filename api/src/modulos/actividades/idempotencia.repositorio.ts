import { createHash, randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { AppError, errores } from '../../comun/errores';

const esquemaReserva = z.object({ id: z.string().uuid(), huella: z.string() });

/** CU10/RNF-10: Redis asocia una intención de alta con un único UUID de actividad. */
export class IdempotenciaRepositorio {
  constructor(
    private readonly redis: Pick<Redis, 'set' | 'get'>,
    private readonly duracionHoras: number,
  ) {}

  /** El registro no se elimina tras un fallo SQL: el reintento usa siempre el mismo UUID. */
  async reservar(usuarioId: string, clave: string, huella: string): Promise<string> {
    const claveRedis = `cu10:${usuarioId}:${createHash('sha256').update(clave).digest('hex')}`;
    const nueva = { id: randomUUID(), huella };
    let valor: string | null;
    try {
      const creada = await this.redis.set(claveRedis, JSON.stringify(nueva), 'EX', this.duracionHoras * 3600, 'NX');
      valor = creada === 'OK' ? JSON.stringify(nueva) : await this.redis.get(claveRedis);
    } catch {
      throw errores.servicioNoDisponible(
        'IDEMPOTENCIA_NO_DISPONIBLE',
        'No pudimos preparar el alta. Reintentá en unos momentos.',
      );
    }
    let contenido: unknown = null;
    try {
      contenido = valor ? JSON.parse(valor) : null;
    } catch {
      // Un registro dañado nunca habilita una nueva alta con otro UUID.
    }
    const reserva = esquemaReserva.safeParse(contenido);
    if (!reserva.success) {
      throw errores.servicioNoDisponible('IDEMPOTENCIA_NO_DISPONIBLE', 'No pudimos confirmar este intento. Reintentá.');
    }
    if (reserva.data.huella !== huella) {
      throw new AppError(409, 'INTENTO_MODIFICADO', 'Ese intento corresponde a otros datos. Revisá el formulario.');
    }
    return reserva.data.id;
  }
}
