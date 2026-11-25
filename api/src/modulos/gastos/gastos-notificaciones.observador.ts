import type { Ejecutor } from '../../infra/postgres';
import type { NotificacionesServicio } from '../notificaciones/notificaciones.servicio';
import type { EventoGasto } from './gastos.eventos';

interface EntregaGasto {
  id: string;
  actividad_id: string;
  usuario_id: string;
  tipo: EventoGasto['tipo'];
  texto: string;
}

/** Entrega los avisos confirmados al módulo CU40; una caída de MongoDB no revierte ni pierde el gasto. */
export class GastosNotificacionesObservador {
  private entregando = false;
  constructor(
    private readonly db: Ejecutor,
    private readonly notificaciones: Pick<NotificacionesServicio, 'notificar'>,
  ) {}

  async entregar(): Promise<void> {
    if (this.entregando) return;
    this.entregando = true;
    try {
      const pendientes = await this.db.query<EntregaGasto>(
        'SELECT id,actividad_id,usuario_id,tipo,texto FROM notificacion_gasto_pendiente WHERE notificada IS NULL ORDER BY fecha,id LIMIT 100',
      );
      if (!pendientes.rows.length) return;
      const porUsuario = new Map<string, EntregaGasto[]>();
      for (const entrega of pendientes.rows) {
        const grupo = porUsuario.get(entrega.usuario_id) ?? [];
        grupo.push(entrega);
        porUsuario.set(entrega.usuario_id, grupo);
      }
      const confirmadas: string[] = [];
      const fallidas: unknown[] = [];
      // Usuarios distintos en paralelo; para un usuario se conserva el orden de sus avisos y contadores.
      await Promise.all(
        [...porUsuario.values()].map(async (entregas) => {
          for (const entrega of entregas) {
            try {
              await this.notificaciones.notificar(entrega.usuario_id, {
                tipo: entrega.tipo,
                texto: entrega.texto,
                destino: { tipo: 'actividad', id: entrega.actividad_id },
                claveEntrega: `gasto:${entrega.id}`,
              });
              confirmadas.push(entrega.id);
            } catch (error) {
              fallidas.push(error);
              break;
            }
          }
        }),
      );
      if (confirmadas.length)
        await this.db.query('UPDATE notificacion_gasto_pendiente SET notificada=now() WHERE id=ANY($1::uuid[])', [confirmadas]);
      if (fallidas.length) throw new AggregateError(fallidas, 'No se pudieron entregar algunas notificaciones de gastos.');
    } finally {
      this.entregando = false;
    }
  }
}
