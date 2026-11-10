import { validar } from '../src/comun/validacion';
import { aFiltrosDeBusqueda, esquemaBusqueda } from '../src/modulos/actividades/actividades.dto';

function filtrosDe(query: Record<string, string>) {
  return aFiltrosDeBusqueda(validar(esquemaBusqueda, query));
}

describe('CU08 – Filtros de la búsqueda', () => {
  it('FP: sin filtros busca todo, desde la página 1 y sin ubicación', () => {
    const datos = validar(esquemaBusqueda, {});
    expect(datos.pagina).toBe(1);
    expect(aFiltrosDeBusqueda(datos)).toEqual({
      deportes: [],
      departamentos: [],
      niveles: [],
      franjas: [],
      desde: undefined,
      hasta: undefined,
      cupoMaximo: undefined,
      ubicacion: undefined,
    });
  });

  it('RN5: los filtros con varios valores llegan separados por coma', () => {
    const filtros = filtrosDe({
      deportes: '1, 3',
      departamentos: 'Rocha,Maldonado',
      niveles: 'principiante,avanzado',
      franjas: 'manana,noche',
    });
    expect(filtros).toMatchObject({
      deportes: [1, 3],
      departamentos: ['Rocha', 'Maldonado'],
      niveles: ['principiante', 'avanzado'],
      franjas: ['manana', 'noche'],
    });
  });

  it('A2: las dos fechas son opcionales; se puede indicar solo una', () => {
    expect(filtrosDe({ desde: '2026-11-14' })).toMatchObject({ desde: '2026-11-14', hasta: undefined });
    expect(filtrosDe({ hasta: '2026-11-20' })).toMatchObject({ desde: undefined, hasta: '2026-11-20' });
  });

  it('A2: "hasta" no puede ser anterior a "desde"', () => {
    expect(() => filtrosDe({ desde: '2026-11-20', hasta: '2026-11-14' })).toThrow(
      expect.objectContaining({ estado: 400, campos: { hasta: 'La fecha "hasta" no puede ser anterior a "desde".' } }),
    );
  });

  it('A3: la cantidad máxima de personas es un entero mayor que 0', () => {
    expect(filtrosDe({ cupoMaximo: '6' }).cupoMaximo).toBe(6);
    expect(() => filtrosDe({ cupoMaximo: '0' })).toThrow(expect.objectContaining({ estado: 400 }));
  });

  it('RN1: la ubicación para ordenar por cercanía necesita latitud y longitud', () => {
    expect(filtrosDe({ lat: '-34.9', lng: '-56.16' }).ubicacion).toEqual({ lat: -34.9, lng: -56.16 });
    expect(() => filtrosDe({ lat: '-34.9' })).toThrow(expect.objectContaining({ estado: 400 }));
  });

  it('rechaza valores que no existen con 400', () => {
    expect(() => filtrosDe({ niveles: 'experto' })).toThrow(expect.objectContaining({ estado: 400 }));
    expect(() => filtrosDe({ franjas: 'madrugada' })).toThrow(expect.objectContaining({ estado: 400 }));
    expect(() => filtrosDe({ departamentos: 'Buenos Aires' })).toThrow(expect.objectContaining({ estado: 400 }));
    expect(() => filtrosDe({ deportes: 'surf' })).toThrow(expect.objectContaining({ estado: 400 }));
    expect(() => filtrosDe({ desde: '14/11/2026' })).toThrow(expect.objectContaining({ estado: 400 }));
  });
});
