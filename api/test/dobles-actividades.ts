import { Actividad, type EstadoActividad, type NivelActividad } from '../src/modulos/actividades/actividad.entidad';
import type {
  DetalleDeActividad,
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
    { direccion: 'Tres Cruces, Montevideo', lat: -34.894, lng: -56.166 },
    { direccion: 'Playa La Aguada, Rocha', lat: -34.655, lng: -54.158 },
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
    private readonly falla: Error | null = null,
  ) {}

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

  private fallarSiCorresponde(): void {
    if (this.falla) {
      throw this.falla;
    }
  }
}
