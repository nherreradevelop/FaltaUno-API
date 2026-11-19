import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import { esquemaIdNotificacion, esquemaListar, esquemaMarcarTodas } from './notificaciones.dto';
import type { NotificacionesServicio } from './notificaciones.servicio';

/** HTTP ↔ NotificacionesServicio (CU40). */
export class NotificacionesControlador {
  constructor(private readonly servicio: NotificacionesServicio) {}

  /** GET /api/notificaciones */
  listar = async (req: Request, res: Response): Promise<void> => {
    const { antesDe } = validar(esquemaListar, req.query);
    res.json(await this.servicio.listar(req.usuarioId!, antesDe ?? null));
  };

  /** GET /api/notificaciones/no-leidas */
  contarNoLeidas = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.servicio.contarNoLeidas(req.usuarioId!));
  };

  /** PATCH /api/notificaciones/:id/leida */
  marcarLeida = async (req: Request, res: Response): Promise<void> => {
    const { id } = validar(esquemaIdNotificacion, req.params);
    res.json(await this.servicio.marcarLeida(req.usuarioId!, id));
  };

  /** POST /api/notificaciones/marcar-todas-leidas */
  marcarTodasLeidas = async (req: Request, res: Response): Promise<void> => {
    const { hasta } = validar(esquemaMarcarTodas, req.body);
    res.json(await this.servicio.marcarTodasLeidas(req.usuarioId!, new Date(hasta)));
  };
}
