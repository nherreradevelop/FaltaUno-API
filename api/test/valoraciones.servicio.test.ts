import { AppError } from '../src/comun/errores';
import { admiteValoraciones, type EstadoActividad } from '../src/modulos/actividades/actividad.entidad';
import type { Valoracion } from '../src/modulos/valoraciones/valoracion.entidad';
import type { ParticipanteParaValorar } from '../src/modulos/valoraciones/valoraciones.repositorio';
import { ValoracionesServicio } from '../src/modulos/valoraciones/valoraciones.servicio';

const ACTIVIDAD = '00000000-0000-4000-9100-000000000004';
const YO = '00000000-0000-4000-8000-000000000001';
const CARLA = '00000000-0000-4000-8000-000000000003';
const DIEGO = '00000000-0000-4000-8000-000000000004';
const AJENO = '00000000-0000-4000-8000-000000000099';

/** Repositorio en memoria: una actividad con sus participantes y las valoraciones guardadas. */
class RepositorioEnMemoria {
  estado: EstadoActividad = 'iniciada';
  existeLaActividad = true;
  participantes = new Set([YO, CARLA, DIEGO]);
  readonly guardadas: Valoracion[] = [];
  falloAlGuardar: Error | null = null;

  async buscarActividadParaValorar(actividadId: string, usuarioId: string) {
    if (!this.existeLaActividad || actividadId !== ACTIVIDAD) return null;
    return { estado: this.estado, participa: this.participantes.has(usuarioId) };
  }

  async participo(_actividadId: string, usuarioId: string) {
    return this.participantes.has(usuarioId);
  }

  async buscarParticipantesParaValorar(_actividadId: string, evaluadorId: string): Promise<ParticipanteParaValorar[]> {
    return [...this.participantes]
      .filter((id) => id !== evaluadorId)
      .map((id) => {
        const guardada = this.guardadas.find((v) => v.evaluadorId === evaluadorId && v.evaluadoId === id);
        return {
          usuario: { id, nombre: `Usuario ${id.slice(-1)}`, fotoUrl: null },
          esOrganizador: id === CARLA,
          miValoracion: guardada ? { puntaje: guardada.puntaje, comentario: guardada.comentario } : null,
        };
      });
  }

  /** Igual que el índice único uk_valoracion: una nueva valoración reemplaza a la anterior (RN2). */
  async guardar(valoracion: Valoracion) {
    if (this.falloAlGuardar) throw this.falloAlGuardar;
    const anterior = this.guardadas.findIndex(
      (v) =>
        v.actividadId === valoracion.actividadId &&
        v.evaluadorId === valoracion.evaluadorId &&
        v.evaluadoId === valoracion.evaluadoId,
    );
    if (anterior >= 0) this.guardadas.splice(anterior, 1);
    this.guardadas.push(valoracion);
  }
}

function armar() {
  const repositorio = new RepositorioEnMemoria();
  const logger = { error: jest.fn() };
  const servicio = new ValoracionesServicio({ valoraciones: repositorio, logger: logger as never });
  return { repositorio, logger, servicio };
}

describe('CU21 – Sistema de valoración de usuarios', () => {
  it('FP pasos 1 y 2: lista a los demás participantes, con los pendientes sin valoración', async () => {
    const { servicio } = armar();
    await servicio.valorar(YO, ACTIVIDAD, CARLA, { puntaje: 4, comentario: null });

    const { participantes } = await servicio.listarParticipantes(YO, ACTIVIDAD);

    expect(participantes.map((p) => [p.usuario.id, p.miValoracion])).toEqual([
      [CARLA, { puntaje: 4, comentario: null }],
      [DIEGO, null],
    ]);
  });

  it('FP pasos 6 a 10: registra la valoración y la devuelve', async () => {
    const { repositorio, servicio } = armar();

    const respuesta = await servicio.valorar(YO, ACTIVIDAD, CARLA, { puntaje: 5, comentario: 'Muy buena organización.' });

    expect(respuesta).toEqual({ valoracion: { puntaje: 5, comentario: 'Muy buena organización.' } });
    expect(repositorio.guardadas).toHaveLength(1);
    expect(repositorio.guardadas[0]).toMatchObject({ actividadId: ACTIVIDAD, evaluadorId: YO, evaluadoId: CARLA, puntaje: 5 });
  });

  it('A2 / RN2: valorar otra vez al mismo participante reemplaza la valoración anterior', async () => {
    const { repositorio, servicio } = armar();
    await servicio.valorar(YO, ACTIVIDAD, CARLA, { puntaje: 2, comentario: 'Llegó tarde.' });

    await servicio.valorar(YO, ACTIVIDAD, CARLA, { puntaje: 4, comentario: null });

    expect(repositorio.guardadas).toHaveLength(1);
    expect(repositorio.guardadas[0]).toMatchObject({ puntaje: 4, comentario: null });
  });

  it.each(['iniciada', 'archivada'] as EstadoActividad[])('E2: con la actividad %s se puede valorar', async (estado) => {
    const { repositorio, servicio } = armar();
    repositorio.estado = estado;

    await expect(servicio.valorar(YO, ACTIVIDAD, DIEGO, { puntaje: 3, comentario: null })).resolves.toBeDefined();
  });

  it.each([
    ['programada', 'Vas a poder valorar a los participantes cuando la actividad se inicie.'],
    ['cancelada', 'La valoración no está disponible en actividades canceladas.'],
  ] as [EstadoActividad, string][])('E2: con la actividad %s no se puede valorar ni ver la lista', async (estado, mensaje) => {
    const { repositorio, servicio } = armar();
    repositorio.estado = estado;

    await expect(servicio.listarParticipantes(YO, ACTIVIDAD)).rejects.toMatchObject({
      estado: 409,
      codigo: 'VALORACION_NO_HABILITADA',
      message: mensaje,
    });
    await expect(servicio.valorar(YO, ACTIVIDAD, CARLA, { puntaje: 3, comentario: null })).rejects.toMatchObject({ estado: 409 });
    expect(repositorio.guardadas).toHaveLength(0);
  });

  it('E2: la regla de estados es la misma que la opción "valorar" del detalle (CU09 RN5)', () => {
    expect(admiteValoraciones('iniciada')).toBe(true);
    expect(admiteValoraciones('archivada')).toBe(true);
    expect(admiteValoraciones('programada')).toBe(false);
    expect(admiteValoraciones('cancelada')).toBe(false);
  });

  it('RN1: quien no participó de la actividad no puede valorar ni ver la lista', async () => {
    const { repositorio, servicio } = armar();

    await expect(servicio.listarParticipantes(AJENO, ACTIVIDAD)).rejects.toMatchObject({ estado: 403, codigo: 'NO_PARTICIPO' });
    await expect(servicio.valorar(AJENO, ACTIVIDAD, CARLA, { puntaje: 3, comentario: null })).rejects.toMatchObject({
      estado: 403,
      codigo: 'NO_PARTICIPO',
    });
    expect(repositorio.guardadas).toHaveLength(0);
  });

  it('RN1: no se puede valorar a alguien que no participó de la actividad', async () => {
    const { repositorio, servicio } = armar();

    const intento = servicio.valorar(YO, ACTIVIDAD, AJENO, { puntaje: 3, comentario: null });

    await expect(intento).rejects.toBeInstanceOf(AppError);
    await expect(intento).rejects.toMatchObject({
      estado: 403,
      message: 'Solo podés valorar a quienes participaron de esta actividad.',
    });
    expect(repositorio.guardadas).toHaveLength(0);
  });

  it('RN5: un usuario no puede valorarse a sí mismo', async () => {
    const { repositorio, servicio } = armar();

    await expect(servicio.valorar(YO, ACTIVIDAD, YO, { puntaje: 5, comentario: null })).rejects.toMatchObject({
      estado: 403,
      codigo: 'VALORACION_PROPIA',
    });
    expect(repositorio.guardadas).toHaveLength(0);
  });

  it('La actividad que no existe responde como no disponible', async () => {
    const { repositorio, servicio } = armar();
    repositorio.existeLaActividad = false;

    await expect(servicio.listarParticipantes(YO, ACTIVIDAD)).rejects.toMatchObject({
      estado: 404,
      codigo: 'ACTIVIDAD_NO_DISPONIBLE',
    });
  });

  it('ER1: si no se puede guardar, registra en el log qué valoración falló y propaga el error', async () => {
    const { repositorio, logger, servicio } = armar();
    const falla = new Error('conexión perdida');
    repositorio.falloAlGuardar = falla;

    await expect(servicio.valorar(YO, ACTIVIDAD, CARLA, { puntaje: 4, comentario: null })).rejects.toBe(falla);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'valoracion_no_guardada', actividadId: ACTIVIDAD, evaluadorId: YO, evaluadoId: CARLA }),
      'No se pudo guardar la valoración',
    );
  });
});
