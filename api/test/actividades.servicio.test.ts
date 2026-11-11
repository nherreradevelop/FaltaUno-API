import { TAMANO_PAGINA_PARTICIPANTES } from '../src/modulos/actividades/actividades.dto';
import { ActividadesServicio } from '../src/modulos/actividades/actividades.servicio';
import type { ParticipanteDeActividad } from '../src/modulos/actividades/actividades.repositorio';
import {
  ACTIVIDAD_ID,
  crearActividad,
  DetallesDeActividadEnMemoria,
  ORGANIZADORA,
  type ActividadGuardada,
} from './dobles-actividades';

const PARTICIPANTE = 'usuario-participante';
const AJENO = 'usuario-ajeno';
const ID_INEXISTENTE = '99999999-9999-4999-8999-999999999999';

const PRONOSTICO = {
  resumen: 'Olas ordenadas por la mañana.',
  nivelRecomendado: 'intermedio' as const,
  interpretacionDisponible: true,
  fechaGeneracion: new Date('2026-11-05T09:00:00.000Z'),
};

function crearParticipantes(cantidad: number): ParticipanteDeActividad[] {
  return Array.from({ length: cantidad }, (_, indice) => ({
    usuario: { id: `usuario-${indice}`, nombre: `Persona ${indice}`, fotoUrl: null },
    esOrganizador: indice === 0,
    invitadosExternos: [],
  }));
}

function guardada(
  cambios: Partial<ActividadGuardada> & { actividad?: ReturnType<typeof crearActividad> } = {},
): ActividadGuardada {
  return {
    detalle: {
      actividad: cambios.actividad ?? crearActividad(),
      organizador: { id: ORGANIZADORA, nombre: 'Martina Rodríguez', fotoUrl: null },
      pronostico: PRONOSTICO,
      ...cambios.detalle,
    },
    participanteIds: cambios.participanteIds ?? [ORGANIZADORA, PARTICIPANTE],
    participantes: cambios.participantes ?? [
      { usuario: { id: ORGANIZADORA, nombre: 'Martina Rodríguez', fotoUrl: null }, esOrganizador: true, invitadosExternos: [] },
      { usuario: { id: PARTICIPANTE, nombre: 'Juan Pérez', fotoUrl: null }, esOrganizador: false, invitadosExternos: ['Sofía'] },
      { usuario: null, esOrganizador: false, invitadosExternos: [] },
    ],
  };
}

function crearServicio(actividad: ActividadGuardada = guardada()) {
  const repositorio = new DetallesDeActividadEnMemoria({ [ACTIVIDAD_ID]: actividad });
  return { servicio: new ActividadesServicio({ actividades: repositorio }), repositorio };
}

describe('CU09 – Detalle de actividad', () => {
  it('FP paso 2: devuelve la información completa de la actividad', async () => {
    const { servicio } = crearServicio();
    const detalle = await servicio.obtenerDetalle(AJENO, ACTIVIDAD_ID);

    expect(detalle).toMatchObject({
      id: ACTIVIDAD_ID,
      nombre: 'Surf en La Paloma',
      deporte: { id: 1, nombre: 'Surf' },
      estado: 'programada',
      fechaHoraInicio: '2026-11-07T10:30:00.000Z',
      nivel: 'intermedio',
      descripcion: 'Llevá traje.',
      origen: { direccion: 'Tres Cruces, Montevideo', lat: -34.894, lng: -56.166 },
      destino: { direccion: 'Playa La Aguada, Rocha', lat: -34.655, lng: -54.158 },
      cupoMaximo: 6,
      cuposOcupados: 3,
      organizador: { id: ORGANIZADORA, nombre: 'Martina Rodríguez', fotoUrl: null },
      costoEstimadoCentesimos: 120000,
      pronostico: {
        resumen: 'Olas ordenadas por la mañana.',
        nivelRecomendado: 'intermedio',
        interpretacionDisponible: true,
        fechaGeneracion: '2026-11-05T09:00:00.000Z',
      },
    });
  });

  it('FP paso 2: sin información ambiental el pronóstico es null', async () => {
    const { servicio } = crearServicio(
      guardada({ detalle: { actividad: crearActividad(), organizador: null, pronostico: null } }),
    );
    const detalle = await servicio.obtenerDetalle(AJENO, ACTIVIDAD_ID);
    expect(detalle.pronostico).toBeNull();
    expect(detalle.organizador).toBeNull();
  });

  it('RN1 / FP paso 3: quien no participa ve el detalle con rol "ninguno" y puede unirse', async () => {
    const { servicio } = crearServicio();
    const detalle = await servicio.obtenerDetalle(AJENO, ACTIVIDAD_ID);
    expect(detalle.miRol).toBe('ninguno');
    expect(detalle.opciones).toContain('unirse');
  });

  it('RN2: el participante ve sus opciones y no las del organizador', async () => {
    const { servicio } = crearServicio();
    const detalle = await servicio.obtenerDetalle(PARTICIPANTE, ACTIVIDAD_ID);
    expect(detalle.miRol).toBe('participante');
    expect(detalle.opciones).toEqual(expect.arrayContaining(['abandonar', 'verChat']));
    expect(detalle.opciones).not.toContain('editar');
    expect(detalle.opciones).not.toContain('unirse');
  });

  it('RN2: el organizador ve editar, remover y cancelar', async () => {
    const { servicio } = crearServicio();
    const detalle = await servicio.obtenerDetalle(ORGANIZADORA, ACTIVIDAD_ID);
    expect(detalle.miRol).toBe('organizador');
    expect(detalle.opciones).toEqual(expect.arrayContaining(['editar', 'removerParticipantes', 'cancelar']));
    expect(detalle.opciones).not.toContain('abandonar');
  });

  it('E1: una actividad cancelada se muestra con su estado y sin la opción de unirse', async () => {
    const { servicio } = crearServicio(guardada({ actividad: crearActividad({ estado: 'cancelada' }) }));
    const detalle = await servicio.obtenerDetalle(AJENO, ACTIVIDAD_ID);
    expect(detalle.estado).toBe('cancelada');
    expect(detalle.opciones).not.toContain('unirse');
  });

  it('RN4: una actividad iniciada indica la fecha límite para registrar gastos y pagos', async () => {
    const { servicio } = crearServicio(guardada({ actividad: crearActividad({ estado: 'iniciada' }) }));
    const detalle = await servicio.obtenerDetalle(PARTICIPANTE, ACTIVIDAD_ID);
    expect(detalle.fechaLimiteGastos).toBe('2026-11-21T10:30:00.000Z');
  });

  it('RN4: en una actividad programada no hay fecha límite', async () => {
    const { servicio } = crearServicio();
    expect((await servicio.obtenerDetalle(PARTICIPANTE, ACTIVIDAD_ID)).fechaLimiteGastos).toBeNull();
  });

  it('RN5: una actividad archivada se puede consultar y solo admite valorar', async () => {
    const { servicio } = crearServicio(guardada({ actividad: crearActividad({ estado: 'archivada' }) }));
    const detalle = await servicio.obtenerDetalle(PARTICIPANTE, ACTIVIDAD_ID);
    expect(detalle.estado).toBe('archivada');
    expect(detalle.opciones).toEqual(['verParticipantes', 'verMapa', 'verChat', 'verGastos', 'valorar']);
  });

  it('E2: si la actividad no existe responde 404 ACTIVIDAD_NO_DISPONIBLE', async () => {
    const { servicio } = crearServicio();
    await expect(servicio.obtenerDetalle(AJENO, ID_INEXISTENTE)).rejects.toMatchObject({
      estado: 404,
      codigo: 'ACTIVIDAD_NO_DISPONIBLE',
    });
  });

  it('ER1: si la base falla, el error llega al manejador centralizado (500 y log)', async () => {
    const falla = new Error('conexión perdida');
    const servicio = new ActividadesServicio({ actividades: new DetallesDeActividadEnMemoria({}, falla) });
    await expect(servicio.obtenerDetalle(AJENO, ACTIVIDAD_ID)).rejects.toBe(falla);
  });
});

describe('CU09 A1 – Ver la lista de participantes', () => {
  it('A1: incluye usuarios registrados, invitados externos y cuentas cerradas', async () => {
    const { servicio } = crearServicio();
    const respuesta = await servicio.obtenerParticipantes(ACTIVIDAD_ID, 1);

    expect(respuesta.pagina).toBe(1);
    expect(respuesta.hayMas).toBe(false);
    expect(respuesta.participantes).toEqual([
      { usuario: { id: ORGANIZADORA, nombre: 'Martina Rodríguez', fotoUrl: null }, esOrganizador: true, invitadosExternos: [] },
      { usuario: { id: PARTICIPANTE, nombre: 'Juan Pérez', fotoUrl: null }, esOrganizador: false, invitadosExternos: ['Sofía'] },
      { usuario: null, esOrganizador: false, invitadosExternos: [] },
    ]);
  });

  it(`A1: pagina de a ${TAMANO_PAGINA_PARTICIPANTES} e indica si hay más`, async () => {
    const { servicio, repositorio } = crearServicio(
      guardada({ participantes: crearParticipantes(TAMANO_PAGINA_PARTICIPANTES + 1) }),
    );

    const primera = await servicio.obtenerParticipantes(ACTIVIDAD_ID, 1);
    const segunda = await servicio.obtenerParticipantes(ACTIVIDAD_ID, 2);

    expect(primera.participantes).toHaveLength(TAMANO_PAGINA_PARTICIPANTES);
    expect(primera.hayMas).toBe(true);
    expect(segunda.participantes).toHaveLength(1);
    expect(segunda.hayMas).toBe(false);
    expect(repositorio.pedidosDeParticipantes[0]).toEqual({
      actividadId: ACTIVIDAD_ID,
      pagina: 1,
      tamanoPagina: TAMANO_PAGINA_PARTICIPANTES,
    });
  });

  it('E2: si la actividad no existe responde 404 ACTIVIDAD_NO_DISPONIBLE', async () => {
    const { servicio } = crearServicio();
    await expect(servicio.obtenerParticipantes(ID_INEXISTENTE, 1)).rejects.toMatchObject({
      estado: 404,
      codigo: 'ACTIVIDAD_NO_DISPONIBLE',
    });
  });
});
