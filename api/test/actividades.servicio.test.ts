import {
  TAMANO_PAGINA_BUSQUEDA,
  TAMANO_PAGINA_PARTICIPANTES,
  type FiltrosDeBusqueda,
} from '../src/modulos/actividades/actividades.dto';
import { ActividadesServicio } from '../src/modulos/actividades/actividades.servicio';
import type { ParticipanteDeActividad } from '../src/modulos/actividades/actividades.repositorio';
import {
  ACTIVIDAD_ID,
  BusquedaEnMemoria,
  crearActividad,
  crearActividadEncontrada,
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

  it('FP paso 2: una actividad sin punto de partida (CU10) se muestra con el origen en null', async () => {
    const { servicio } = crearServicio(guardada({ actividad: crearActividad({ origen: null }) }));
    const detalle = await servicio.obtenerDetalle(AJENO, ACTIVIDAD_ID);
    expect(detalle.origen).toBeNull();
    expect(detalle.destino).toEqual({ direccion: 'Playa La Aguada, Rocha', lat: -34.655, lng: -54.158 });
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

const ANA = 'usuario-1';
const SIN_FILTROS: FiltrosDeBusqueda = { deportes: [], departamentos: [], niveles: [], franjas: [] };

function crearActividades(cantidad: number) {
  return Array.from({ length: cantidad }, (_, indice) => crearActividadEncontrada({ id: `actividad-${indice + 1}` }));
}

describe('CU08 – Buscar actividades', () => {
  it('FP: devuelve nombre, deporte, fecha y hora, departamento, nivel y cupos libres de cada actividad', async () => {
    const servicio = new ActividadesServicio({
      actividades: new BusquedaEnMemoria([crearActividadEncontrada({ id: 'actividad-1' })]),
    });
    await expect(servicio.buscar(ANA, SIN_FILTROS, 1)).resolves.toEqual({
      actividades: [
        {
          id: 'actividad-1',
          nombre: 'Surf en La Paloma',
          deporte: { id: 1, nombre: 'Surf' },
          fechaHoraInicio: '2026-11-07T10:30:00.000Z',
          departamento: 'Rocha',
          nivel: 'intermedio',
          cuposLibres: 3,
          organizador: { id: ORGANIZADORA, nombre: 'Martina Rodríguez', valoracionPromedio: 4.33 },
          esOrganizador: false,
        },
      ],
      pagina: 1,
      hayMas: false,
    });
  });

  it('FP: las actividades que organiza el usuario aparecen marcadas', async () => {
    const servicio = new ActividadesServicio({
      actividades: new BusquedaEnMemoria([crearActividadEncontrada({ organizadorId: ANA })]),
    });
    const resultado = await servicio.buscar(ANA, SIN_FILTROS, 1);
    expect(resultado.actividades[0].esOrganizador).toBe(true);
  });

  it('si el organizador cerró su cuenta, la actividad se muestra sin organizador', async () => {
    const servicio = new ActividadesServicio({
      actividades: new BusquedaEnMemoria([crearActividadEncontrada({ organizadorId: null })]),
    });
    const resultado = await servicio.buscar(ANA, SIN_FILTROS, 1);
    expect(resultado.actividades[0].organizador).toBeNull();
    expect(resultado.actividades[0].esOrganizador).toBe(false);
  });

  it('el organizador sin valoraciones llega con valoracionPromedio null', async () => {
    const servicio = new ActividadesServicio({
      actividades: new BusquedaEnMemoria([crearActividadEncontrada({ organizadorValoracion: null })]),
    });
    const resultado = await servicio.buscar(ANA, SIN_FILTROS, 1);
    expect(resultado.actividades[0].organizador?.valoracionPromedio).toBeNull();
  });

  it(`FP: se muestra de a ${TAMANO_PAGINA_BUSQUEDA} actividades e indica si hay más`, async () => {
    const busqueda = new BusquedaEnMemoria(crearActividades(12));
    const servicio = new ActividadesServicio({ actividades: busqueda });

    const primera = await servicio.buscar(ANA, SIN_FILTROS, 1);
    const segunda = await servicio.buscar(ANA, SIN_FILTROS, 2);

    expect(primera.actividades).toHaveLength(TAMANO_PAGINA_BUSQUEDA);
    expect(primera.hayMas).toBe(true);
    expect(segunda.actividades.map((actividad) => actividad.id)).toEqual(['actividad-11', 'actividad-12']);
    expect(segunda.hayMas).toBe(false);
    expect(busqueda.pedidos[0]).toMatchObject({ pagina: 1, tamanoPagina: TAMANO_PAGINA_BUSQUEDA });
  });

  it('A1 a A6 / RN4: los filtros elegidos llegan tal cual al repositorio, combinados', async () => {
    const busqueda = new BusquedaEnMemoria();
    const filtros: FiltrosDeBusqueda = {
      deportes: [1, 3],
      departamentos: ['Rocha'],
      niveles: ['intermedio'],
      franjas: ['manana', 'tarde'],
      desde: '2026-11-14',
      hasta: '2026-11-20',
      cupoMaximo: 6,
      ubicacion: { lat: -34.9, lng: -56.16 },
    };
    await new ActividadesServicio({ actividades: busqueda }).buscar(ANA, filtros, 1);
    expect(busqueda.pedidos[0].filtros).toEqual(filtros);
  });

  it('E1: si no hay actividades para los filtros, devuelve una lista vacía', async () => {
    const servicio = new ActividadesServicio({ actividades: new BusquedaEnMemoria([]) });
    await expect(servicio.buscar(ANA, SIN_FILTROS, 1)).resolves.toEqual({ actividades: [], pagina: 1, hayMas: false });
  });

  it('ER1: si falla la base, el error se propaga y no se devuelve una lista parcial', async () => {
    const busquedaQueFalla = new BusquedaEnMemoria([], new Error('timeout de PostgreSQL'));
    const servicio = new ActividadesServicio({ actividades: busquedaQueFalla });
    await expect(servicio.buscar(ANA, SIN_FILTROS, 1)).rejects.toThrow('timeout de PostgreSQL');
  });
});
