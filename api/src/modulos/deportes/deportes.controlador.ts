import type { Request, Response } from 'express';
import type { DeportesServicio } from './deportes.servicio';

/** HTTP ↔ DeportesServicio. */
export class DeportesControlador {
  constructor(private readonly servicio: DeportesServicio) {}

  /** GET /api/deportes */
  listarActivos = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.servicio.listarActivos());
  };
}
