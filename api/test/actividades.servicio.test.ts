import { TAMANO_PAGINA_BUSQUEDA, type FiltrosDeBusqueda } from '../src/modulos/actividades/actividades.dto';
import { ActividadesServicio } from '../src/modulos/actividades/actividades.servicio';
import { DeportesServicio } from '../src/modulos/deportes/deportes.servicio';
import { BusquedaEnMemoria, crearActividad, crearDeporte } from './dobles';

const ANA = 'usuario-1';
const SIN_FILTROS: FiltrosDeBusqueda = { deportes: [], departamentos: [], niveles: [], franjas: [] };

function crearActividades(cantidad: number) {
  return Array.from({ length: cantidad }, (_, indice) => crearActividad({ id: `actividad-${indice + 1}` }));
}

describe('CU08 – Buscar actividades', () => {
  it('FP: devuelve nombre, deporte, fecha y hora, departamento, nivel y cupos libres de cada actividad', async () => {
    const servicio = new ActividadesServicio({ actividades: new BusquedaEnMemoria([crearActividad()]) });
    await expect(servicio.buscar(ANA, SIN_FILTROS, 1)).resolves.toEqual({
      actividades: [
        {
          id: 'actividad-1',
          nombre: 'Surf en La Paloma',
          deporte: { id: 1, nombre: 'Surf' },
          fechaHoraInicio: '2026-11-14T10:30:00.000Z',
          departamento: 'Rocha',
          nivel: 'intermedio',
          cuposLibres: 2,
          organizador: { id: 'usuario-2', nombre: 'Bruno Silva', valoracionPromedio: 4.33 },
          esOrganizador: false,
        },
      ],
      pagina: 1,
      hayMas: false,
    });
  });

  it('FP: las actividades que organiza el usuario aparecen marcadas', async () => {
    const servicio = new ActividadesServicio({
      actividades: new BusquedaEnMemoria([crearActividad({ organizadorId: ANA })]),
    });
    const resultado = await servicio.buscar(ANA, SIN_FILTROS, 1);
    expect(resultado.actividades[0].esOrganizador).toBe(true);
  });

  it('si el organizador cerró su cuenta, la actividad se muestra sin organizador', async () => {
    const servicio = new ActividadesServicio({
      actividades: new BusquedaEnMemoria([crearActividad({ organizadorId: null })]),
    });
    const resultado = await servicio.buscar(ANA, SIN_FILTROS, 1);
    expect(resultado.actividades[0].organizador).toBeNull();
    expect(resultado.actividades[0].esOrganizador).toBe(false);
  });

  it('el organizador sin valoraciones llega con valoracionPromedio null', async () => {
    const servicio = new ActividadesServicio({
      actividades: new BusquedaEnMemoria([crearActividad({ organizadorValoracion: null })]),
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
    const busquedaQueFalla = {
      buscarDisponibles: async () => {
        throw new Error('timeout de PostgreSQL');
      },
    };
    const servicio = new ActividadesServicio({ actividades: busquedaQueFalla });
    await expect(servicio.buscar(ANA, SIN_FILTROS, 1)).rejects.toThrow('timeout de PostgreSQL');
  });
});

describe('CU08 A1 / ER2 – Opciones del filtro de deportes', () => {
  it('lista los deportes activos del catálogo', async () => {
    const servicio = new DeportesServicio({ listarActivos: async () => [crearDeporte(3, 'Ciclismo'), crearDeporte(1, 'Surf')] });
    await expect(servicio.listarActivos()).resolves.toEqual([
      { id: 3, nombre: 'Ciclismo' },
      { id: 1, nombre: 'Surf' },
    ]);
  });
});
