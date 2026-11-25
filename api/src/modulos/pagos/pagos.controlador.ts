import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import { esquemaEliminarGasto, esquemaIdGasto, esquemaOperacionGasto, esquemaPaginaGasto } from '../gastos/gastos.dto';
import { esquemaDatosPago, esquemaEditarPago } from './pagos.dto';
import type { PagosServicio } from './pagos.servicio';

/** Traducción HTTP de CU26 y de la edición/eliminación de pagos de CU24/CU25. */
export class PagosControlador {
  constructor(private readonly servicio: PagosServicio) {}
  listar = async (req: Request, res: Response) => {
    res.json(await this.servicio.listar(req.usuarioId!, this.actividad(req), validar(esquemaPaginaGasto, req.query).cursor));
  };
  opciones = async (req: Request, res: Response) => {
    res.json(await this.servicio.opciones(req.usuarioId!, this.actividad(req)));
  };
  detalle = async (req: Request, res: Response) => {
    res.json(await this.servicio.detalle(req.usuarioId!, this.actividad(req), validar(esquemaIdGasto, req.params.pagoId)));
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
    const datos = validar(esquemaDatosPago, req.body);
    res.locals.pagoServicioIniciado = true;
    res.status(201).json(await this.servicio.ejecutar(req.usuarioId!, actividadId, clave, 'registrar', datos));
  };
  editar = async (req: Request, res: Response) => {
    const actividadId = this.actividad(req);
    const clave = this.clave(req);
    const pagoId = validar(esquemaIdGasto, req.params.pagoId);
    const { version, ...datos } = validar(esquemaEditarPago, req.body);
    res.locals.pagoServicioIniciado = true;
    res.json(await this.servicio.ejecutar(req.usuarioId!, actividadId, clave, 'editar', datos, pagoId, version));
  };
  eliminar = async (req: Request, res: Response) => {
    const actividadId = this.actividad(req);
    const clave = this.clave(req);
    const pagoId = validar(esquemaIdGasto, req.params.pagoId);
    const { version } = validar(esquemaEliminarGasto, req.body);
    res.locals.pagoServicioIniciado = true;
    res.json(await this.servicio.ejecutar(req.usuarioId!, actividadId, clave, 'eliminar', null, pagoId, version));
  };
  private actividad(req: Request) {
    return validar(esquemaIdGasto, req.params.actividadId);
  }
  private clave(req: Request) {
    return validar(esquemaOperacionGasto, req.get('Idempotency-Key'));
  }
}
