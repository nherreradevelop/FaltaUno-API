import { createHash } from 'node:crypto';
import { errores } from '../../comun/errores';
import type { GoogleMaps } from '../../infra/google-maps';
import type { ActividadesRepositorio } from './actividades.repositorio';
import { NIVELES_ACTIVIDAD, NuevaActividad } from './actividad.entidad';
import { aActividadCreada, type ActividadCreadaDto, type DatosCrearActividad, type UbicacionActividad } from './actividades.dto';
import type { IdempotenciaRepositorio } from './idempotencia.repositorio';
import type { SesionesRepositorio } from '../auth/sesiones.repositorio';
import { DESTINO_PROVISIONAL_ID } from './destino-provisional';
import type { Coordenadas, ResolvedorPuntos } from './ubicaciones';

export interface DependenciasCrearActividad {
  repositorio: Pick<ActividadesRepositorio, 'deportesActivos' | 'cuentaActiva' | 'buscarCreada'>;
  transaccion: <T>(operacion: (repositorio: ActividadesRepositorio) => Promise<T>) => Promise<T>;
  mapas: Pick<GoogleMaps, 'buscar' | 'resolver' | 'disponible'>;
  puntos: ResolvedorPuntos;
  idempotencia: Pick<IdempotenciaRepositorio, 'reservar'>;
  maximoParticipantes: number;
  destinoProvisional: Readonly<UbicacionActividad>;
  sesiones: Pick<SesionesRepositorio, 'buscarUsuarioId'>;
  ahora?: () => Date;
}

/**
 * CU10 – Crear actividad: validación y orquestación independientes de Express y de las conexiones concretas.
 * Va aparte de ActividadesServicio (CU08 y CU09) porque depende de Google Maps, Redis y transacciones que la
 * búsqueda y el detalle no usan.
 */
export class CrearActividadServicio {
  constructor(private readonly dependencias: DependenciasCrearActividad) {}

  /** Opciones del formulario sin duplicar límites o catálogo en los clientes. */
  async opciones(usuarioId: string) {
    await this.verificarCuenta(usuarioId);
    return {
      deportes: await this.dependencias.repositorio.deportesActivos(),
      niveles: NIVELES_ACTIVIDAD,
      maximoParticipantes: this.dependencias.maximoParticipantes,
      mapasDisponibles: this.dependencias.mapas.disponible(),
      destinoPorDefecto: {
        placeId: DESTINO_PROVISIONAL_ID,
        descripcion: this.dependencias.destinoProvisional.direccion,
        lat: this.dependencias.destinoProvisional.lat,
        lng: this.dependencias.destinoProvisional.lng,
        provisional: true as const,
      },
      // Pendiente: CU15. Placeholder acordado: no promete una tarea de actualización inexistente.
      pronostico: { disponible: false as const, mensaje: 'La información climática estará disponible próximamente.' },
    };
  }

  /** CU10 E4: predicciones del proveedor, no ubicaciones generadas por la aplicación. */
  async buscarUbicaciones(usuarioId: string, texto: string, sesion: string) {
    await this.verificarCuenta(usuarioId);
    return this.dependencias.mapas.buscar(texto, sesion);
  }

  /** CU10: previsualización del pin; el alta repite la validación sin confiar en la descripción del cliente. */
  async resolverPunto(usuarioId: string, punto: Coordenadas) {
    await this.verificarCuenta(usuarioId);
    return this.dependencias.puntos.resolver(punto);
  }

  /** Coordenadas del lugar seleccionado para centrar el mapa al cambiar de modo. */
  async detalleUbicacion(usuarioId: string, placeId: string) {
    await this.verificarCuenta(usuarioId);
    return this.dependencias.mapas.resolver(placeId);
  }

  /** CU10 FP: el reintento recupera la misma actividad incluso si se perdió la respuesta del commit. */
  async crear(usuarioId: string, clave: string, datos: DatosCrearActividad, token: string): Promise<ActividadCreadaDto> {
    if ((await this.dependencias.sesiones.buscarUsuarioId(token)) !== usuarioId) throw this.sesionInvalida();
    await this.verificarCuenta(usuarioId);
    const huella = createHash('sha256').update(JSON.stringify(datos)).digest('hex');
    const id = await this.dependencias.idempotencia.reservar(usuarioId, clave, huella);
    const existente = await this.dependencias.repositorio.buscarCreada(id, usuarioId);
    if (existente) return existente;

    const actividad = new NuevaActividad(datos);
    actividad.validarCreacion(this.dependencias.maximoParticipantes, this.ahora());
    const destinoProvisional = datos.destinoPlaceId === DESTINO_PROVISIONAL_ID;
    if (destinoProvisional && this.dependencias.mapas.disponible()) {
      throw errores.validacion({ destinoPlaceId: 'Google Maps está disponible. Seleccioná el destino real de la actividad.' });
    }
    if (datos.origenPlaceId === DESTINO_PROVISIONAL_ID) {
      throw errores.validacion({ origenPlaceId: 'La ubicación por defecto solo se puede usar como destino.' });
    }
    const [origen, destino] = await Promise.all([
      datos.origenPlaceId === null && !datos.origenCoordenadas
        ? null
        : this.resolverUbicacion(datos.origenPlaceId, datos.origenCoordenadas),
      destinoProvisional
        ? this.dependencias.destinoProvisional
        : this.resolverUbicacion(datos.destinoPlaceId, datos.destinoCoordenadas),
    ]);
    // ER3: el token puede vencer mientras responde Google; no registrar con una sesión ya vencida.
    if ((await this.dependencias.sesiones.buscarUsuarioId(token)) !== usuarioId) throw this.sesionInvalida();

    return this.dependencias.transaccion(async (repositorio) => {
      await repositorio.bloquearAlta(id);
      const confirmada = await repositorio.buscarCreada(id, usuarioId);
      if (confirmada) return confirmada;
      if (!(await repositorio.cuentaActiva(usuarioId))) throw this.sesionInvalida();
      actividad.validarCreacion(this.dependencias.maximoParticipantes, this.ahora());
      const deportes = await repositorio.deportesActivos();
      if (!deportes.some((deporte) => deporte.id === datos.deporteId)) {
        throw errores.validacion({ deporteId: 'Seleccioná un deporte activo del catálogo.' });
      }
      await repositorio.crear(id, usuarioId, datos, origen, destino, destinoProvisional);
      return aActividadCreada(id, datos, destinoProvisional);
    });
  }

  private ahora(): Date {
    return this.dependencias.ahora?.() ?? new Date();
  }

  private resolverUbicacion(placeId: string | null, punto?: Coordenadas): Promise<UbicacionActividad> {
    if (punto) return this.dependencias.puntos.resolver(punto);
    if (placeId) return this.dependencias.mapas.resolver(placeId);
    throw errores.validacion({ ubicacion: 'Seleccioná una ubicación válida.' });
  }

  private sesionInvalida() {
    return errores.noAutenticado('SESION_INVALIDA', 'Tu sesión venció. Iniciá sesión de nuevo.');
  }

  private async verificarCuenta(usuarioId: string): Promise<void> {
    if (!(await this.dependencias.repositorio.cuentaActiva(usuarioId))) throw this.sesionInvalida();
  }
}
