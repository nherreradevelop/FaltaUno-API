import {
  Actividad,
  type EstadoActividad,
  type NivelActividad,
  type Ubicacion,
} from '../src/modulos/actividades/actividad.entidad';
import type { FiltrosDeBusqueda } from '../src/modulos/actividades/actividades.dto';
import type {
  ActividadEncontrada,
  DetalleDeActividad,
  PaginaDeActividades,
  PaginaDeParticipantes,
  ParticipanteDeActividad,
} from '../src/modulos/actividades/actividades.repositorio';
import type { DependenciasActividades } from '../src/modulos/actividades/actividades.servicio';
import { Deporte } from '../src/modulos/deportes/deporte.entidad';

// Archivo aparte de dobles.ts: no depende de bcrypt, así estas pruebas no necesitan el módulo nativo

export const ACTIVIDAD_ID = '11111111-1111-4111-8111-111111111111';
export const ORGANIZADORA = 'usuario-organizadora';

interface DatosDeActividad {
  id: string;
  /** null: la actividad no tiene punto de partida (CU10). */
  origen: Ubicacion | null;
  departamento: string;
  estado: EstadoActividad;
  fechaHoraInicio: Date;
  nivel: NivelActividad;
  cupoMaximo: number;
  cuposOcupados: number;
  organizadorId: string | null;
  costoEstimadoCentesimos: number | null;
}

export function crearActividad(cambios: Partial<DatosDeActividad> = {}): Actividad {
  const datos: DatosDeActividad = {
    id: ACTIVIDAD_ID,
    origen: { direccion: 'Tres Cruces, Montevideo', lat: -34.894, lng: -56.166 },
    departamento: 'Rocha',
    estado: 'programada',
    fechaHoraInicio: new Date('2026-11-07T10:30:00.000Z'),
    nivel: 'intermedio',
    cupoMaximo: 6,
    cuposOcupados: 3,
    organizadorId: ORGANIZADORA,
    costoEstimadoCentesimos: 120000,
    ...cambios,
  };
  return new Actividad(
    datos.id,
    'Surf en La Paloma',
    new Deporte(1, 'Surf'),
    datos.estado,
    datos.fechaHoraInicio,
    datos.nivel,
    'Llevá traje.',
    datos.origen,
    { direccion: 'Playa La Aguada, Rocha', lat: -34.655, lng: -54.158 },
    datos.departamento,
    datos.cupoMaximo,
    datos.cuposOcupados,
    datos.organizadorId,
    datos.costoEstimadoCentesimos,
  );
}

/** Una actividad guardada: el detalle y quiénes participan, como lo resolvería la base. */
export interface ActividadGuardada {
  detalle: Omit<DetalleDeActividad, 'participaElUsuario'>;
  participanteIds: string[];
  participantes: ParticipanteDeActividad[];
}

type RepositorioActividades = DependenciasActividades['actividades'];

/** Reproduce en memoria las consultas del CU09 de ActividadesRepositorio. Puede simular una falla de la base (ER1). */
export class DetallesDeActividadEnMemoria implements RepositorioActividades {
  readonly pedidosDeParticipantes: { actividadId: string; pagina: number; tamanoPagina: number }[] = [];

  constructor(
    private readonly guardadas: Record<string, ActividadGuardada> = {},
    protected readonly falla: Error | null = null,
  ) {}

  /** El CU08 se prueba con BusquedaEnMemoria; acá la búsqueda no devuelve nada. */
  async buscarDisponibles(_filtros: FiltrosDeBusqueda, _pagina: number, _tamanoPagina: number): Promise<PaginaDeActividades> {
    this.fallarSiCorresponde();
    return { actividades: [], hayMas: false };
  }

  async buscarDetalle(actividadId: string, usuarioId: string): Promise<DetalleDeActividad | null> {
    this.fallarSiCorresponde();
    const guardada = this.guardadas[actividadId];
    if (!guardada) {
      return null;
    }
    return { ...guardada.detalle, participaElUsuario: guardada.participanteIds.includes(usuarioId) };
  }

  async existe(actividadId: string): Promise<boolean> {
    this.fallarSiCorresponde();
    return actividadId in this.guardadas;
  }

  async buscarParticipantes(actividadId: string, pagina: number, tamanoPagina: number): Promise<PaginaDeParticipantes> {
    this.fallarSiCorresponde();
    this.pedidosDeParticipantes.push({ actividadId, pagina, tamanoPagina });
    const participantes = this.guardadas[actividadId]?.participantes ?? [];
    const desde = (pagina - 1) * tamanoPagina;
    return {
      participantes: participantes.slice(desde, desde + tamanoPagina),
      hayMas: participantes.length > desde + tamanoPagina,
    };
  }

  protected fallarSiCorresponde(): void {
    if (this.falla) {
      throw this.falla;
    }
  }
}

/** CU08: una actividad de la búsqueda con su organizador (equivale a una fila de buscarDisponibles). */
export function crearActividadEncontrada(
  cambios: Partial<DatosDeActividad> & {
    organizadorNombre?: string;
    organizadorValoracion?: number | null;
    tieneVehiculo?: boolean;
    requiereVehiculo?: boolean;
  } = {},
): ActividadEncontrada {
  const {
    organizadorNombre = 'Martina Rodríguez',
    organizadorValoracion = 4.33,
    tieneVehiculo = false,
    requiereVehiculo = false,
    ...datos
  } = cambios;
  const actividad = crearActividad(datos);
  const organizador =
    actividad.organizadorId === null
      ? null
      : { id: actividad.organizadorId, nombre: organizadorNombre, valoracionPromedio: organizadorValoracion };
  return { actividad, organizador, tieneVehiculo, requiereVehiculo };
}

/**
 * CU08: devuelve las actividades configuradas (ya filtradas y ordenadas, como lo haría el SQL) y registra
 * con qué filtros se la llamó. Los filtros en sí se aplican en SQL y se prueban contra la base.
 */
export class BusquedaEnMemoria extends DetallesDeActividadEnMemoria {
  readonly pedidos: { filtros: FiltrosDeBusqueda; pagina: number; tamanoPagina: number; usuarioId?: string }[] = [];

  constructor(
    private readonly disponibles: ActividadEncontrada[] = [],
    falla: Error | null = null,
  ) {
    super({}, falla);
  }

  override async buscarDisponibles(
    filtros: FiltrosDeBusqueda,
    pagina: number,
    tamanoPagina: number,
    usuarioId?: string,
  ): Promise<PaginaDeActividades> {
    this.fallarSiCorresponde();
    this.pedidos.push({ filtros, pagina, tamanoPagina, usuarioId });
    const desde = (pagina - 1) * tamanoPagina;
    return {
      actividades: this.disponibles.slice(desde, desde + tamanoPagina),
      hayMas: this.disponibles.length > desde + tamanoPagina,
    };
  }
}
