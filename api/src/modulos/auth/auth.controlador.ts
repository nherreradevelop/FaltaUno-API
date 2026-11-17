import type { Request, Response } from 'express';
import { leerTokenBearer } from '../../comun/middlewares/requiereSesion';
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

  /** POST /api/auth/cerrar-sesion – CU37. Responde 204 aunque la sesión ya no exista (E1, RN6). */
  cerrarSesion = async (req: Request, res: Response): Promise<void> => {
    await this.servicio.cerrarSesion(leerTokenBearer(req));
    res.status(204).end();
  };
}
