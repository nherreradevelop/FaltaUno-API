import { Pool, type QueryResult, type QueryResultRow } from 'pg';

/** Lo mínimo que necesita un repositorio: sirve tanto para el pool como para un cliente dentro de una transacción. */
export interface Ejecutor {
  query<Fila extends QueryResultRow>(sql: string, parametros?: unknown[]): Promise<QueryResult<Fila>>;
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
