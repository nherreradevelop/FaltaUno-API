import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

/** Lo mínimo que necesita un repositorio: sirve tanto para el pool como para un cliente dentro de una transacción. */
export interface Ejecutor {
  query<Fila extends QueryResultRow>(sql: string, parametros?: unknown[]): Promise<QueryResult<Fila>>;
}

/** Confirma todas las escrituras del CU juntas y libera siempre la conexión. */
export async function enTransaccion<T>(pool: Pick<Pool, 'connect'>, operacion: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  let descartarConexion = false;
  try {
    await cliente.query('BEGIN');
    const resultado = await operacion(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await cliente.query('ROLLBACK');
    } catch {
      descartarConexion = true;
    }
    throw error;
  } finally {
    cliente.release(descartarConexion);
  }
}

// RNF-08: si la base no responde a tiempo, la operación falla en lugar de quedar colgada
const TIEMPO_CONEXION_MS = 5_000;
const TIEMPO_CONSULTA_MS = 10_000;

export function crearPoolPostgres(url: string): Pool {
  return new Pool({
    connectionString: url,
    connectionTimeoutMillis: TIEMPO_CONEXION_MS,
    query_timeout: TIEMPO_CONSULTA_MS,
  });
}
