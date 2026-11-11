import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import { esquemaIdDeActividad, esquemaPaginaParticipantes } from './actividades.dto';
import { actividadNoDisponible, type ActividadesServicio } from './actividades.servicio';

/** HTTP ↔ ActividadesServicio. En todas las rutas, requiereSesion ya completó req.usuarioId. */
export class ActividadesControlador {
  constructor(private readonly servicio: ActividadesServicio) {}

  /** GET /api/actividades/:id – CU09 FP. */
  obtenerDetalle = async (req: Request, res: Response): Promise<void> => {
    const actividadId = leerIdDeActividad(req);
    res.json(await this.servicio.obtenerDetalle(req.usuarioId!, actividadId));
  };

  /** GET /api/actividades/:id/participantes?pagina=N – CU09 A1. */
  obtenerParticipantes = async (req: Request, res: Response): Promise<void> => {
    const actividadId = leerIdDeActividad(req);
    const { pagina } = validar(esquemaPaginaParticipantes, req.query);
    res.json(await this.servicio.obtenerParticipantes(actividadId, pagina));
  };
}

/** Un id con formato inválido no puede corresponder a ninguna actividad: se responde como E2. */
function leerIdDeActividad(req: Request): string {
  const idValido = esquemaIdDeActividad.safeParse(req.params.id);
  if (!idValido.success) {
    throw actividadNoDisponible();
  }
  return idValido.data;
}
