import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import { esquemaLogin, esquemaLoginGoogle } from './auth.dto';
import type { AuthServicio } from './auth.servicio';

/** HTTP ↔ AuthServicio. */
export class AuthControlador {
  constructor(private readonly servicio: AuthServicio) {}

  /** POST /api/auth/login – CU01 FP. */
  iniciarSesion = async (req: Request, res: Response): Promise<void> => {
    const datos = validar(esquemaLogin, req.body);
    res.json(await this.servicio.iniciarSesion(datos));
  };

  /** POST /api/auth/google – CU01 A1. */
  iniciarSesionConGoogle = async (req: Request, res: Response): Promise<void> => {
    const datos = validar(esquemaLoginGoogle, req.body);
    res.json(await this.servicio.iniciarSesionConGoogle(datos));
  };
}
