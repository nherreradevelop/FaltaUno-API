import { AppError } from '../src/comun/errores';
import type { EstadoActividad } from '../src/modulos/actividades/actividad.entidad';
import { esquemaUnirseActividad } from '../src/modulos/actividades/actividades.dto';
import { crearEventosDeActividades, type ParticipanteUnido } from '../src/modulos/actividades/actividades.eventos';
import type { ActividadParaIncorporacion, NuevaParticipacion } from '../src/modulos/actividades/actividades.repositorio';
import { UnirseActividadServicio, type DependenciasUnirseActividad } from '../src/modulos/actividades/unirse-actividad.servicio';
import { LUGAR_ACTIVIDAD } from './actividades.fixtures';
import { ACTIVIDAD_ID, crearActividad, ORGANIZADORA } from './dobles-actividades';

const USUARIO = 'usuario-que-se-une';
const ANTES_DEL_INICIO = new Date('2026-11-06T10:30:00.000Z');

function datos(cambios: Record<string, unknown> = {}) {
  return esquemaUnirseActividad.parse({ tieneVehiculo: false, lugaresVehiculo: null, invitados: [], ...cambios });
}

interface Escenario {
  estado?: EstadoActividad;
  cupoMaximo?: number;
  cuposOcupados?: number;
  yaParticipa?: boolean;
  existe?: boolean;
  falla?: Error;
}

/** Doble en memoria de la transacción: guarda lo que se registró y deja ver si se confirmó. */
function preparar(escenario: Escenario = {}) {
  const registradas: NuevaParticipacion[] = [];
  const eventosRecibidos: ParticipanteUnido[] = [];
  const logger = { error: jest.fn() };
  const eventos = crearEventosDeActividades(logger);
  eventos.participanteUnido.suscribir((evento) => {
    eventosRecibidos.push(evento);
  });

  const encontrada: ActividadParaIncorporacion = {
    actividad: crearActividad({
      estado: escenario.estado ?? 'programada',
      cupoMaximo: escenario.cupoMaximo ?? 6,
      cuposOcupados: escenario.cuposOcupados ?? 3,
    }),
    yaParticipa: escenario.yaParticipa ?? false,
  };
  const repositorio = {
    bloquearParaIncorporacion: jest.fn(async () => (escenario.existe === false ? null : encontrada)),
    registrarParticipacion: jest.fn(async (_actividadId: string, _usuarioId: string, participacion: NuevaParticipacion) => {
      if (escenario.falla) throw escenario.falla;
      registradas.push(participacion);
    }),
  };
  const dependencias: DependenciasUnirseActividad = {
    transaccion: async (operacion) => operacion(repositorio),
    mapas: { resolver: jest.fn().mockResolvedValue(LUGAR_ACTIVIDAD) },
    puntos: { resolver: jest.fn().mockImplementation(async (punto) => ({ ...LUGAR_ACTIVIDAD, ...punto })) },
    eventos,
    logger,
    ahora: () => ANTES_DEL_INICIO,
  };
  return {
    servicio: new UnirseActividadServicio(dependencias),
    dependencias,
    repositorio,
    registradas,
    eventosRecibidos,
    logger,
  };
}

/** notificar() no espera a los observadores: se deja correr la cola de microtareas antes de verificar. */
const terminarObservadores = () => new Promise((resolve) => setImmediate(resolve));

async function codigoDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof AppError) return `${error.estado} ${error.codigo}`;
    throw error;
  }
  throw new Error('Se esperaba un error');
}

describe('CU11 – Unirse a una actividad (servicio)', () => {
  it('FP: registra al usuario con sus invitados, devuelve los cupos actualizados y emite participanteUnido', async () => {
    const { servicio, registradas, eventosRecibidos, repositorio } = preparar({ cupoMaximo: 6, cuposOcupados: 3 });

    const resultado = await servicio.unirse(USUARIO, ACTIVIDAD_ID, datos({ invitados: ['Ana', 'Luis'] }));

    expect(repositorio.bloquearParaIncorporacion).toHaveBeenCalledWith(ACTIVIDAD_ID, USUARIO);
    expect(registradas).toEqual([
      { tieneVehiculo: false, lugaresVehiculo: null, puntoPartida: null, invitados: ['Ana', 'Luis'] },
    ]);
    expect(resultado).toEqual({ actividadId: ACTIVIDAD_ID, cupoMaximo: 6, cuposOcupados: 6, cuposLibres: 0 });
    await terminarObservadores();
    expect(eventosRecibidos).toEqual([
      { actividadId: ACTIVIDAD_ID, usuarioId: USUARIO, organizadorId: ORGANIZADORA, cantidadInvitados: 2 },
    ]);
  });

  it('FP paso 5: con vehículo y punto de partida elegido por lugar, lo valida Google y lo guarda', async () => {
    const { servicio, registradas, dependencias } = preparar();
    await servicio.unirse(
      USUARIO,
      ACTIVIDAD_ID,
      datos({ tieneVehiculo: true, lugaresVehiculo: 3, puntoPartidaPlaceId: 'lugar-1' }),
    );
    expect(dependencias.mapas.resolver).toHaveBeenCalledWith('lugar-1');
    expect(registradas[0]).toMatchObject({ tieneVehiculo: true, lugaresVehiculo: 3, puntoPartida: LUGAR_ACTIVIDAD });
  });

  it('FP paso 5: el punto de partida también se puede marcar con un pin', async () => {
    const { servicio, registradas, dependencias } = preparar();
    await servicio.unirse(USUARIO, ACTIVIDAD_ID, datos({ puntoPartidaCoordenadas: { lat: -34.8, lng: -56.1 } }));
    expect(dependencias.puntos.resolver).toHaveBeenCalledWith({ lat: -34.8, lng: -56.1 });
    expect(registradas[0].puntoPartida).toMatchObject({ lat: -34.8, lng: -56.1 });
  });

  it('FP paso 5: sin punto de partida no consulta Google', async () => {
    const { servicio, dependencias } = preparar();
    await servicio.unirse(USUARIO, ACTIVIDAD_ID, datos());
    expect(dependencias.mapas.resolver).not.toHaveBeenCalled();
    expect(dependencias.puntos.resolver).not.toHaveBeenCalled();
  });

  it('punto de partida: si Google no responde, rechaza sin abrir la transacción ni notificar', async () => {
    const { servicio, dependencias, repositorio, eventosRecibidos } = preparar();
    jest.mocked(dependencias.mapas.resolver).mockRejectedValue(new AppError(503, 'MAPAS_NO_DISPONIBLES', 'No disponible.'));
    expect(await codigoDeError(servicio.unirse(USUARIO, ACTIVIDAD_ID, datos({ puntoPartidaPlaceId: 'lugar-1' })))).toBe(
      '503 MAPAS_NO_DISPONIBLES',
    );
    expect(repositorio.bloquearParaIncorporacion).not.toHaveBeenCalled();
    await terminarObservadores();
    expect(eventosRecibidos).toEqual([]);
  });

  it('E1: actividad completa → 409 ACTIVIDAD_COMPLETA, no registra ni notifica', async () => {
    const { servicio, registradas, eventosRecibidos } = preparar({ cupoMaximo: 4, cuposOcupados: 4 });
    expect(await codigoDeError(servicio.unirse(USUARIO, ACTIVIDAD_ID, datos()))).toBe('409 ACTIVIDAD_COMPLETA');
    expect(registradas).toEqual([]);
    await terminarObservadores();
    expect(eventosRecibidos).toEqual([]);
  });

  it.each<EstadoActividad>(['iniciada', 'archivada'])(
    'E2: actividad %s → 409 ACTIVIDAD_NO_ADMITE_INCORPORACIONES',
    async (estado) => {
      const { servicio, registradas } = preparar({ estado });
      expect(await codigoDeError(servicio.unirse(USUARIO, ACTIVIDAD_ID, datos()))).toBe(
        '409 ACTIVIDAD_NO_ADMITE_INCORPORACIONES',
      );
      expect(registradas).toEqual([]);
    },
  );

  it('E3: actividad cancelada → 409 ACTIVIDAD_CANCELADA', async () => {
    const { servicio, registradas } = preparar({ estado: 'cancelada' });
    expect(await codigoDeError(servicio.unirse(USUARIO, ACTIVIDAD_ID, datos()))).toBe('409 ACTIVIDAD_CANCELADA');
    expect(registradas).toEqual([]);
  });

  it('RN2: si ya participa → 409 YA_PARTICIPA (también cubre el reintento tras una respuesta perdida)', async () => {
    const { servicio, registradas } = preparar({ yaParticipa: true });
    expect(await codigoDeError(servicio.unirse(USUARIO, ACTIVIDAD_ID, datos()))).toBe('409 YA_PARTICIPA');
    expect(registradas).toEqual([]);
  });

  it('RN9: si no hay lugar para todos los invitados → 409 LUGARES_INSUFICIENTES con los lugares que quedan', async () => {
    const { servicio } = preparar({ cupoMaximo: 6, cuposOcupados: 4 });
    const promesa = servicio.unirse(USUARIO, ACTIVIDAD_ID, datos({ invitados: ['Ana', 'Luis'] }));
    await expect(promesa).rejects.toMatchObject({
      codigo: 'LUGARES_INSUFICIENTES',
      message: 'No hay lugar para todos tus invitados. Quedan 2 lugares.',
    });
  });

  it('RN9: con un solo lugar libre el mensaje va en singular', async () => {
    const { servicio } = preparar({ cupoMaximo: 6, cuposOcupados: 5 });
    await expect(servicio.unirse(USUARIO, ACTIVIDAD_ID, datos({ invitados: ['Ana'] }))).rejects.toMatchObject({
      message: 'No hay lugar para todos tus invitados. Queda 1 lugar.',
    });
  });

  it('la actividad no existe → 404 ACTIVIDAD_NO_DISPONIBLE', async () => {
    const { servicio } = preparar({ existe: false });
    expect(await codigoDeError(servicio.unirse(USUARIO, ACTIVIDAD_ID, datos()))).toBe('404 ACTIVIDAD_NO_DISPONIBLE');
  });

  it('ER1: si falla el registro, lo deja en el log con los IDs, propaga el error y no notifica', async () => {
    const falla = new Error('conexión perdida');
    const { servicio, logger, eventosRecibidos } = preparar({ falla });
    await expect(servicio.unirse(USUARIO, ACTIVIDAD_ID, datos())).rejects.toBe(falla);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'cu11_registro_participante_fallido', actividadId: ACTIVIDAD_ID, usuarioId: USUARIO }),
      expect.any(String),
    );
    await terminarObservadores();
    expect(eventosRecibidos).toEqual([]);
  });

  it('RN15: si un observador falla, la incorporación igual se confirma y el fallo queda en el log', async () => {
    const { servicio, dependencias, logger } = preparar();
    dependencias.eventos.participanteUnido.suscribir(() => {
      throw new Error('falló la notificación');
    });
    await expect(servicio.unirse(USUARIO, ACTIVIDAD_ID, datos())).resolves.toMatchObject({ cuposOcupados: 4 });
    await terminarObservadores();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'observador_participante_unido_fallido', actividadId: ACTIVIDAD_ID }),
      expect.any(String),
    );
  });
});

describe('CU11 – esquemaUnirseActividad', () => {
  it.each<[Record<string, unknown>, string]>([
    [{ tieneVehiculo: true, lugaresVehiculo: null }, 'con vehículo sin indicar lugares'],
    [{ tieneVehiculo: false, lugaresVehiculo: 2 }, 'lugares sin vehículo'],
    [{ puntoPartidaPlaceId: 'lugar', puntoPartidaCoordenadas: { lat: -34, lng: -56 } }, 'lugar y pin a la vez'],
    [{ invitados: [' '] }, 'invitado sin nombre'],
    [{ extra: true }, 'campos desconocidos'],
  ])('rechaza %j (%s)', (cambios) => {
    expect(
      esquemaUnirseActividad.safeParse({ tieneVehiculo: false, lugaresVehiculo: null, invitados: [], ...cambios }).success,
    ).toBe(false);
  });

  it('el punto de partida es opcional aunque tenga vehículo (RN10)', () => {
    expect(esquemaUnirseActividad.safeParse({ tieneVehiculo: true, lugaresVehiculo: 0, invitados: [] }).success).toBe(true);
  });
});
