import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import { esquemaIdDeActividad } from '../actividades/actividades.dto';
import { actividadNoDisponible } from '../actividades/actividades.servicio';
import { esquemaIdDeUsuario, esquemaValoracion } from './valoraciones.dto';
import type { ValoracionesServicio } from './valoraciones.servicio';

/** HTTP ↔ CU21. requiereSesion ya completó req.usuarioId. */
export class ValoracionesControlador {
  constructor(private readonly servicio: ValoracionesServicio) {}

  /** GET /api/actividades/:id/valoraciones – CU21 FP pasos 1 y 2. */
  listarParticipantes = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.servicio.listarParticipantes(req.usuarioId!, leerIdDeActividad(req)));
  };

  /** PUT /api/actividades/:id/valoraciones/:usuarioId – CU21 FP pasos 6 a 10 y A2. */
  valorar = async (req: Request, res: Response): Promise<void> => {
    const actividadId = leerIdDeActividad(req);
    const evaluadoId = validar(esquemaIdDeUsuario, req.params.usuarioId);
    const datos = validar(esquemaValoracion, req.body);
    res.json(await this.servicio.valorar(req.usuarioId!, actividadId, evaluadoId, datos));
  };
}

/** Un id con formato inválido no puede corresponder a ninguna actividad: se responde como si no existiera. */
function leerIdDeActividad(req: Request): string {
  const idValido = esquemaIdDeActividad.safeParse(req.params.id);
  if (!idValido.success) {
    throw actividadNoDisponible();
  }
  return idValido.data;
}
