import type { Ejecutor } from '../../infra/postgres';

export type EstadoActividad = 'programada' | 'iniciada' | 'archivada' | 'cancelada';

/** Datos de una actividad que se muestran en el historial del perfil (CU04 FP paso 2). */
export interface ActividadDelHistorial {
  id: string;
  nombre: string;
  deporte: string;
  fechaHoraInicio: Date;
  estado: EstadoActividad;
}

export interface PaginaDeHistorial {
  actividades: ActividadDelHistorial[];
  hayMas: boolean;
}

interface FilaHistorial {
  id: string;
  nombre: string;
  deporte: string;
  fecha_hora_inicio: Date;
  estado: EstadoActividad;
}

/** El historial muestra solo actividades terminadas: archivadas o canceladas, las haya organizado o no. */
const ESTADOS_DEL_HISTORIAL: EstadoActividad[] = ['archivada', 'cancelada'];

/** Acceso a las tablas actividad y participacion. */
export class ActividadesRepositorio {
  constructor(private readonly db: Ejecutor) {}

  /**
   * CU04 FP paso 2: actividades en las que participó el usuario, de la más reciente a la más antigua.
   * Se pide una fila de más para saber si hay otra página sin hacer un COUNT. Usa ix_participacion_usuario.
   */
  async buscarHistorialDeParticipante(usuarioId: string, pagina: number, tamanoPagina: number): Promise<PaginaDeHistorial> {
    const desplazamiento = (pagina - 1) * tamanoPagina;
    const resultado = await this.db.query<FilaHistorial>(
      `SELECT a.id, a.nombre, d.nombre AS deporte, a.fecha_hora_inicio, a.estado
       FROM participacion p
       JOIN actividad a ON a.id = p.actividad_id
       JOIN deporte d ON d.id = a.deporte_id
       WHERE p.usuario_id = $1 AND a.estado = ANY($2)
       ORDER BY a.fecha_hora_inicio DESC, a.id DESC
       LIMIT $3 OFFSET $4`,
      [usuarioId, ESTADOS_DEL_HISTORIAL, tamanoPagina + 1, desplazamiento],
    );

    const hayMas = resultado.rows.length > tamanoPagina;
    const filasDeLaPagina = resultado.rows.slice(0, tamanoPagina);
    return { actividades: filasDeLaPagina.map(aActividadDelHistorial), hayMas };
  }

  /** CU04 A1: cantidad de actividades del historial (mismo criterio que buscarHistorialDeParticipante). */
  async contarHistorialDeParticipante(usuarioId: string): Promise<number> {
    // COUNT devuelve bigint, que pg entrega como texto
    const resultado = await this.db.query<{ cantidad: string }>(
      `SELECT count(*) AS cantidad
       FROM participacion p
       JOIN actividad a ON a.id = p.actividad_id
       WHERE p.usuario_id = $1 AND a.estado = ANY($2)`,
      [usuarioId, ESTADOS_DEL_HISTORIAL],
    );
    return Number(resultado.rows[0]?.cantidad ?? 0);
  }
}

function aActividadDelHistorial(fila: FilaHistorial): ActividadDelHistorial {
  return {
    id: fila.id,
    nombre: fila.nombre,
    deporte: fila.deporte,
    fechaHoraInicio: fila.fecha_hora_inicio,
    estado: fila.estado,
  };
}
