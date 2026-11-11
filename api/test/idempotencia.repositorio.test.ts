import { IdempotenciaRepositorio } from '../src/modulos/actividades/idempotencia.repositorio';

describe('CU10 idempotencia Redis', () => {
  it('RNF-10: reserva y recupera el mismo UUID de alta, con expiración', async () => {
    let valor: string | null = null;
    const redis = {
      set: jest.fn(async (_k: string, v: string) => {
        if (valor) return null;
        valor = v;
        return 'OK';
      }),
      get: jest.fn(async () => valor),
    };
    const repo = new IdempotenciaRepositorio(redis as never, 24);
    const primera = await repo.reservar('usuario', 'clave', 'huella');
    expect(await repo.reservar('usuario', 'clave', 'huella')).toBe(primera);
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', 86400, 'NX');
    await expect(repo.reservar('usuario', 'clave', 'otra-huella')).rejects.toMatchObject({ estado: 409 });
  });
  it('ER2: no habilita una escritura si Redis falla', async () => {
    const repo = new IdempotenciaRepositorio(
      { set: jest.fn().mockRejectedValue(new Error('Redis caído')), get: jest.fn() } as never,
      24,
    );
    await expect(repo.reservar('usuario', 'clave', 'huella')).rejects.toMatchObject({ estado: 503 });
  });
  it.each([null, 'no es JSON', '{}'])('ER2: no reemplaza una reserva ilegible (%s)', async (valor) => {
    const repo = new IdempotenciaRepositorio(
      { set: jest.fn().mockResolvedValue(null), get: jest.fn().mockResolvedValue(valor) } as never,
      24,
    );
    await expect(repo.reservar('usuario', 'clave', 'huella')).rejects.toMatchObject({ estado: 503 });
  });
});
