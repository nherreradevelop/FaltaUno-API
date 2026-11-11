import { z } from 'zod';
import type { EstadoActividad, NivelActividad, OpcionDeActividad, RolEnActividad, Ubicacion } from './actividad.entidad';
import type { DetalleDeActividad, PaginaDeParticipantes, ParticipanteDeActividad } from './actividades.repositorio';

/** CU09 A1: la lista de participantes se pide de a 20 (valor técnico, no de negocio). */
export const TAMANO_PAGINA_PARTICIPANTES = 20;

/** CU09: id de la actividad que se consulta. */
export const esquemaIdDeActividad = z.string().uuid();

/** CU09 A1: página de la lista de participantes (query ?pagina=N, empieza en 1). */
export const esquemaPaginaParticipantes = z.object({
  pagina: z.coerce
    .number({ invalid_type_error: 'La página tiene que ser un número.' })
    .int('La página tiene que ser un número entero.')
    .min(1, 'La página empieza en 1.')
    .default(1),
});

export interface PronosticoDto {
  resumen: string;
  nivelRecomendado: NivelActividad | null;
  interpretacionDisponible: boolean;
  fechaGeneracion: string;
}

/** CU09 FP: detalle completo de la actividad, el rol del usuario y las opciones que le corresponden. */
export interface DetalleActividadDto {
  id: string;
  nombre: string;
  deporte: { id: number; nombre: string };
  /** RN4: Programada, Iniciada, Archivada o Cancelada. */
  estado: EstadoActividad;
  fechaHoraInicio: string;
  /** RN4: solo en estado Iniciada; null en los demás. */
  fechaLimiteGastos: string | null;
  nivel: NivelActividad;
  descripcion: string | null;
  origen: Ubicacion;
  destino: Ubicacion;
  cupoMaximo: number;
  /** Participantes más invitados externos. */
  cuposOcupados: number;
  /** null si el organizador cerró su cuenta. */
  organizador: { id: string; nombre: string; fotoUrl: string | null } | null;
  /** En centésimos (120000 = $ 1.200); null si no corresponde. */
  costoEstimadoCentesimos: number | null;
  /** null si no hay información ambiental disponible. */
  pronostico: PronosticoDto | null;
  miRol: RolEnActividad;
  opciones: OpcionDeActividad[];
}

export interface ParticipanteDto {
  usuario: { id: string; nombre: string; fotoUrl: string | null } | null;
  esOrganizador: boolean;
  invitadosExternos: string[];
}

export interface ParticipantesDto {
  participantes: ParticipanteDto[];
  pagina: number;
  hayMas: boolean;
}

export function aDetalleActividadDto(detalle: DetalleDeActividad, usuarioId: string): DetalleActividadDto {
  const { actividad, organizador, pronostico } = detalle;
  const rol = actividad.rolDe(usuarioId, detalle.participaElUsuario);
  const fechaLimiteGastos = actividad.fechaLimiteGastos();

  return {
    id: actividad.id,
    nombre: actividad.nombre,
    deporte: { id: actividad.deporte.id, nombre: actividad.deporte.nombre },
    estado: actividad.estado,
    fechaHoraInicio: actividad.fechaHoraInicio.toISOString(),
    fechaLimiteGastos: fechaLimiteGastos === null ? null : fechaLimiteGastos.toISOString(),
    nivel: actividad.nivel,
    descripcion: actividad.descripcion,
    origen: actividad.origen,
    destino: actividad.destino,
    cupoMaximo: actividad.cupoMaximo,
    cuposOcupados: actividad.cuposOcupados,
    organizador,
    costoEstimadoCentesimos: actividad.costoEstimadoCentesimos,
    pronostico:
      pronostico === null
        ? null
        : {
            resumen: pronostico.resumen,
            nivelRecomendado: pronostico.nivelRecomendado,
            interpretacionDisponible: pronostico.interpretacionDisponible,
            fechaGeneracion: pronostico.fechaGeneracion.toISOString(),
          },
    miRol: rol,
    opciones: actividad.opcionesPara(rol),
  };
}

function aParticipanteDto(participante: ParticipanteDeActividad): ParticipanteDto {
  return {
    usuario: participante.usuario,
    esOrganizador: participante.esOrganizador,
    invitadosExternos: participante.invitadosExternos,
  };
}

export function aParticipantesDto(paginaDeParticipantes: PaginaDeParticipantes, pagina: number): ParticipantesDto {
  return {
    participantes: paginaDeParticipantes.participantes.map(aParticipanteDto),
    pagina,
    hayMas: paginaDeParticipantes.hayMas,
  };
}
