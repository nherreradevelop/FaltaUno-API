import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import { esquemaIdDeUsuario, esquemaPaginaHistorial } from './usuarios.dto';
import { perfilNoDisponible, type UsuariosServicio } from './usuarios.servicio';

/** HTTP ↔ UsuariosServicio. En todas las rutas, requiereSesion ya completó req.usuarioId. */
export class UsuariosControlador {
  constructor(private readonly servicio: UsuariosServicio) {}

  /** GET /api/usuarios/yo */
  obtenerUsuarioActual = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.servicio.obtenerUsuarioActual(req.usuarioId!));
  };

  /** GET /api/usuarios/yo/perfil – CU04 FP. */
  obtenerPerfilPropio = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.servicio.obtenerPerfil(req.usuarioId!, req.usuarioId!));
  };

  /** GET /api/usuarios/yo/actividades?pagina=N – CU04 FP paso 2 (historial paginado). */
  obtenerHistorialPropio = async (req: Request, res: Response): Promise<void> => {
    const { pagina } = validar(esquemaPaginaHistorial, req.query);
    res.json(await this.servicio.obtenerHistorial(req.usuarioId!, pagina));
  };

  /** GET /api/usuarios/:id/perfil – CU04 A1. Si :id es el propio usuario, responde como el FP. */
  obtenerPerfilDeUsuario = async (req: Request, res: Response): Promise<void> => {
    const idValido = esquemaIdDeUsuario.safeParse(req.params.id);
    // Un id con formato inválido no puede corresponder a ningún usuario: se responde como E1
    if (!idValido.success) {
      throw perfilNoDisponible();
    }
    res.json(await this.servicio.obtenerPerfil(req.usuarioId!, idValido.data));
  };
}
