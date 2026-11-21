import { MongoClient, type Db } from 'mongodb';

// RNF-08: si MongoDB no responde, la operación falla rápido en lugar de quedar esperando
const TIEMPO_SELECCION_SERVIDOR_MS = 3_000;

/**
 * Cliente de MongoDB (notificaciones; más adelante chats y auditoría, RNF-26).
 * No espera a conectarse: el driver se conecta con la primera operación, así un Mongo caído
 * no impide que arranque el resto de la API.
 */
export function crearClienteMongo(url: string, nombreBase: string): { cliente: MongoClient; db: Db } {
  const cliente = new MongoClient(url, { serverSelectionTimeoutMS: TIEMPO_SELECCION_SERVIDOR_MS });
  return { cliente, db: cliente.db(nombreBase) };
}
