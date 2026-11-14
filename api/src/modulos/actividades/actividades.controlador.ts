import type { Request, Response } from 'express';
import { validar } from '../../comun/validacion';
import {
  aFiltrosDeBusqueda,
  DEPARTAMENTOS,
  esquemaBusqueda,
  esquemaBusquedaUbicacion,
  esquemaClaveIdempotencia,
  esquemaConsultaLugar,
  esquemaConsultaPunto,
  esquemaCrearActividad,
  esquemaIdDeActividad,
  esquemaPaginaParticipantes,
} from './actividades.dto';
import { actividadNoDisponible, type ActividadesServicio } from './actividades.servicio';
import type { CrearActividadServicio } from './crear-actividad.servicio';

/**
 * HTTP ↔ servicios de actividades: búsqueda y detalle (CU08, CU09) y alta (CU10).
 * En todas las rutas, requiereSesion ya completó req.usuarioId.
 */
export class ActividadesControlador {
  constructor(
    private readonly servicio: ActividadesServicio,
    private readonly creacion: CrearActividadServicio,
  ) {}

  /** GET /api/actividades?deportes=1,3&departamentos=Rocha&niveles=intermedio&franjas=manana&desde=…&hasta=…&cupoMaximo=6&lat=…&lng=…&pagina=1 – CU08. */
  buscar = async (req: Request, res: Response): Promise<void> => {
    const datos = validar(esquemaBusqueda, req.query);
    res.json(await this.servicio.buscar(req.usuarioId!, aFiltrosDeBusqueda(datos), datos.pagina));
  };

  /** GET /api/actividades/departamentos – CU08 A5: opciones del filtro de ubicación. */
  listarDepartamentos = (_req: Request, res: Response): void => {
    res.json(DEPARTAMENTOS);
  };

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

  /** GET /api/actividades/opciones – CU10: catálogos y límites del formulario. */
  opciones = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.creacion.opciones(req.usuarioId!));
  };

  /** GET /api/actividades/ubicaciones?texto=…&sesion=… – CU10 E4: sugerencias de Google Maps. */
  buscarUbicaciones = async (req: Request, res: Response): Promise<void> => {
    const consulta = validar(esquemaBusquedaUbicacion, req.query);
    res.json(await this.creacion.buscarUbicaciones(req.usuarioId!, consulta.texto, consulta.sesion));
  };

  /** GET /api/actividades/ubicaciones/punto?lat=…&lng=… – CU10: lugar de un pin en el mapa. */
  resolverPunto = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.creacion.resolverPunto(req.usuarioId!, validar(esquemaConsultaPunto, req.query)));
  };

  /** GET /api/actividades/ubicaciones/detalle?placeId=… – CU10: coordenadas del lugar elegido. */
  detalleUbicacion = async (req: Request, res: Response): Promise<void> => {
    const consulta = validar(esquemaConsultaLugar, req.query);
    res.json(await this.creacion.detalleUbicacion(req.usuarioId!, consulta.placeId));
  };

  /** POST /api/actividades – CU10 FP. Requiere Idempotency-Key (RNF-10). */
  crear = async (req: Request, res: Response): Promise<void> => {
    const datos = validar(esquemaCrearActividad, req.body);
    const clave = validar(esquemaClaveIdempotencia, req.get('Idempotency-Key'));
    res.status(201).json(await this.creacion.crear(req.usuarioId!, clave, datos, req.get('Authorization')!.slice(7)));
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
