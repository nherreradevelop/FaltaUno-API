import type { Request, Response } from 'express';
import type { UsuariosServicio } from './usuarios.servicio';

/** HTTP ↔ UsuariosServicio. */
export class UsuariosControlador {
  constructor(private readonly servicio: UsuariosServicio) {}

  /** GET /api/usuarios/yo. requiereSesion ya completó req.usuarioId. */
  obtenerUsuarioActual = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.servicio.obtenerUsuarioActual(req.usuarioId!));
  };
}
