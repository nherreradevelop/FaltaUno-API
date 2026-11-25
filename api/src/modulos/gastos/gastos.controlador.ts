import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import {
  esquemaDatosGasto,
  esquemaEditarGasto,
  esquemaEliminarGasto,
  esquemaIdGasto,
  esquemaOperacionGasto,
  esquemaPaginaGasto,
} from './gastos.dto';
import type { GastosServicio } from './gastos.servicio';

/** Borde HTTP de CU23–CU25. Todas las reglas de dominio se resuelven en el servicio. */
export class GastosControlador {
  constructor(private readonly servicio: GastosServicio) {}
  listar = async (req: Request, res: Response) => {
    res.json(await this.servicio.listar(req.usuarioId!, this.actividad(req), validar(esquemaPaginaGasto, req.query).cursor));
  };
  opciones = async (req: Request, res: Response) => {
    res.json(await this.servicio.opciones(req.usuarioId!, this.actividad(req)));
  };
  balances = async (req: Request, res: Response) => {
    res.json(await this.servicio.balances(req.usuarioId!, this.actividad(req)));
  };
  detalle = async (req: Request, res: Response) => {
    res.json(await this.servicio.detalle(req.usuarioId!, this.actividad(req), validar(esquemaIdGasto, req.params.gastoId)));
  };
  consultar = async (req: Request, res: Response) => {
    res.json(
      await this.servicio.consultarOperacion(
        req.usuarioId!,
        this.actividad(req),
        validar(esquemaOperacionGasto, req.params.clave),
      ),
    );
  };
  crear = async (req: Request, res: Response) => {
    const actividadId = this.actividad(req);
    const clave = this.clave(req);
    const datos = validar(esquemaDatosGasto, req.body);
    res.locals.gastoServicioIniciado = true;
    res.status(201).json(await this.servicio.ejecutar(req.usuarioId!, actividadId, clave, 'registrar', datos));
  };
  editar = async (req: Request, res: Response) => {
    const { version, ...datos } = validar(esquemaEditarGasto, req.body);
    const actividadId = this.actividad(req);
    const clave = this.clave(req);
    const gastoId = validar(esquemaIdGasto, req.params.gastoId);
    res.locals.gastoServicioIniciado = true;
    res.json(await this.servicio.ejecutar(req.usuarioId!, actividadId, clave, 'editar', datos, gastoId, version));
  };
  eliminar = async (req: Request, res: Response) => {
    const { version } = validar(esquemaEliminarGasto, req.body);
    const actividadId = this.actividad(req);
    const clave = this.clave(req);
    const gastoId = validar(esquemaIdGasto, req.params.gastoId);
    res.locals.gastoServicioIniciado = true;
    res.json(await this.servicio.ejecutar(req.usuarioId!, actividadId, clave, 'eliminar', null, gastoId, version));
  };
  private actividad(req: Request) {
    return validar(esquemaIdGasto, req.params.actividadId);
  }
  private clave(req: Request) {
    return validar(esquemaOperacionGasto, req.get('Idempotency-Key'));
  }
}
