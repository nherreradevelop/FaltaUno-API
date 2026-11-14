import type { Pool, PoolClient } from 'pg';
import { enTransaccion } from '../src/infra/postgres';

function preparar() {
  const cliente = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  const pool = { connect: jest.fn().mockResolvedValue(cliente) } as unknown as Pick<Pool, 'connect'>;
  return { cliente, pool };
}
describe('Transacción PostgreSQL de CU10', () => {
  it('FP: confirma después de ejecutar el CU y libera el cliente', async () => {
    const { pool, cliente } = preparar();
    expect(
      await enTransaccion(pool, async (tx: PoolClient) => {
        await tx.query('escritura');
        return 'resultado';
      }),
    ).toBe('resultado');
    expect(cliente.query.mock.calls.map(([consulta]) => consulta)).toEqual(['BEGIN', 'escritura', 'COMMIT']);
    expect(cliente.release).toHaveBeenCalledWith(false);
  });
  it('ER1: revierte un fallo y conserva su causa', async () => {
    const { pool, cliente } = preparar();
    const fallo = new Error('Fallo del repositorio');
    await expect(
      enTransaccion(pool, async () => {
        throw fallo;
      }),
    ).rejects.toBe(fallo);
    expect(cliente.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(cliente.release).toHaveBeenCalledWith(false);
  });
  it('ER2: descarta una conexión en la que también falla el rollback', async () => {
    const { pool, cliente } = preparar();
    cliente.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('Conexión rota'));
    const fallo = new Error('Fallo del repositorio');
    await expect(
      enTransaccion(pool, async () => {
        throw fallo;
      }),
    ).rejects.toBe(fallo);
    expect(cliente.release).toHaveBeenCalledWith(true);
  });
  it('ER2: no devuelve éxito si falla la confirmación', async () => {
    const { pool, cliente } = preparar();
    cliente.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('Respuesta de COMMIT perdida'))
      .mockResolvedValueOnce({ rows: [] });
    await expect(enTransaccion(pool, async () => 'resultado')).rejects.toThrow('Respuesta de COMMIT perdida');
    expect(cliente.release).toHaveBeenCalled();
  });
});
