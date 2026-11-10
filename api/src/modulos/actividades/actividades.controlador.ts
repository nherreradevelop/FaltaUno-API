import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import { aFiltrosDeBusqueda, DEPARTAMENTOS, esquemaBusqueda } from './actividades.dto';
import type { ActividadesServicio } from './actividades.servicio';

/** HTTP ↔ ActividadesServicio. En todas las rutas, requiereSesion ya completó req.usuarioId (CU08 ER3). */
export class ActividadesControlador {
  constructor(private readonly servicio: ActividadesServicio) {}

  /** GET /api/actividades?deportes=1,3&departamentos=Rocha&niveles=intermedio&franjas=manana&desde=…&hasta=…&cupoMaximo=6&lat=…&lng=…&pagina=1 – CU08. */
  buscar = async (req: Request, res: Response): Promise<void> => {
    const datos = validar(esquemaBusqueda, req.query);
    res.json(await this.servicio.buscar(req.usuarioId!, aFiltrosDeBusqueda(datos), datos.pagina));
  };

  /** GET /api/actividades/departamentos – CU08 A5: opciones del filtro de ubicación. */
  listarDepartamentos = (_req: Request, res: Response): void => {
    res.json(DEPARTAMENTOS);
  };
}
