import type { Pool } from 'pg';
import type { Logger } from '../../infra/logger';
import { enTransaccion } from '../../infra/postgres';
import { PagosRetencionRepositorio } from './pagos-retencion.repositorio';

/** Retira un lote al arrancar y cada hora; las consultas aplican el vencimiento sin esperar este proceso. */
export function iniciarRetencionPagos(db: Pool, logger: Logger): () => void {
  let ejecutando = false;
  let advertida = false;
  async function ejecutar() {
    if (ejecutando) return;
    ejecutando = true;
    try {
      await enTransaccion(db, (tx) => new PagosRetencionRepositorio(tx).retirarHistorialVencido());
    } catch (err) {
      if ((err as { code?: string }).code === '42P01') {
        if (!advertida)
          logger.warn({ evento: 'pagos_migracion_pendiente' }, 'Aplicar migración 007 para habilitar pagos y retención.');
        advertida = true;
      } else logger.error({ err, evento: 'retencion_pagos_fallida' }, 'Se reintentará la retención de pagos.');
    } finally {
      ejecutando = false;
    }
  }
  const temporizador = setInterval(() => void ejecutar(), 60 * 60 * 1000);
  temporizador.unref();
  void ejecutar();
  return () => clearInterval(temporizador);
}
