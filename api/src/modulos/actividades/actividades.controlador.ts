import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import {
  esquemaBusquedaUbicacion,
  esquemaClaveIdempotencia,
  esquemaConsultaLugar,
  esquemaConsultaPunto,
  esquemaCrearActividad,
} from './actividades.dto';
import type { ActividadesServicio } from './actividades.servicio';

/** HTTP del CU10: las reglas y transacciones viven en el servicio. */
export class ActividadesControlador {
  constructor(private readonly servicio: ActividadesServicio) {}

  opciones = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.servicio.opciones(req.usuarioId!));
  };

  buscarUbicaciones = async (req: Request, res: Response): Promise<void> => {
    const consulta = validar(esquemaBusquedaUbicacion, req.query);
    res.json(await this.servicio.buscarUbicaciones(req.usuarioId!, consulta.texto, consulta.sesion));
  };

  resolverPunto = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.servicio.resolverPunto(req.usuarioId!, validar(esquemaConsultaPunto, req.query)));
  };

  detalleUbicacion = async (req: Request, res: Response): Promise<void> => {
    const consulta = validar(esquemaConsultaLugar, req.query);
    res.json(await this.servicio.detalleUbicacion(req.usuarioId!, consulta.placeId));
  };

  crear = async (req: Request, res: Response): Promise<void> => {
    const datos = validar(esquemaCrearActividad, req.body);
    const clave = validar(esquemaClaveIdempotencia, req.get('Idempotency-Key'));
    res.status(201).json(await this.servicio.crear(req.usuarioId!, clave, datos, req.get('Authorization')!.slice(7)));
  };
}
