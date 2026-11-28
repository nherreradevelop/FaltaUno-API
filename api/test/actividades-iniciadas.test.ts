import { ActividadesServicio } from '../src/modulos/actividades/actividades.servicio';
import { esquemaPaginaIniciadas } from '../src/modulos/actividades/actividades.dto';
import { DetallesDeActividadEnMemoria } from './dobles-actividades';

describe('CU42 – Actividades iniciadas', () => {
  it.each([true, false])(
    'A4: agrega hayIniciadasHoy=%s a la consulta de Explorar aunque no haya resultados',
    async (hayIniciadasHoy) => {
      const repositorio = new DetallesDeActividadEnMemoria();
      const consulta = jest.spyOn(repositorio, 'tieneIniciadasHoy').mockResolvedValue(hayIniciadasHoy);
      const servicio = new ActividadesServicio({ actividades: repositorio });
      await expect(
        servicio.buscar(
          'usuario-de-sesion',
          {
            grupo: 'otras',
            deportes: [],
            departamentos: ['Rocha'],
            niveles: [],
            franjas: [],
          },
          3,
        ),
      ).resolves.toEqual({ actividades: [], pagina: 3, hayMas: false, hayIniciadasHoy });
      expect(consulta).toHaveBeenCalledTimes(1);
      expect(consulta).toHaveBeenCalledWith('usuario-de-sesion', expect.any(Date));
    },
  );

  it('A4: las otras dos secciones no repiten la consulta del banner', async () => {
    const repositorio = new DetallesDeActividadEnMemoria();
    const consulta = jest.spyOn(repositorio, 'tieneIniciadasHoy');
    const servicio = new ActividadesServicio({ actividades: repositorio });
    for (const grupo of ['gestionando', 'unido'] as const) {
      const resultado = await servicio.buscar('usuario', { grupo, deportes: [], departamentos: [], niveles: [], franjas: [] }, 1);
      expect(resultado).not.toHaveProperty('hayIniciadasHoy');
    }
    expect(consulta).not.toHaveBeenCalled();
  });
  const actividad = {
    id: 'actividad',
    nombre: 'Surf',
    deporte: { id: 1, nombre: 'Surf' },
    fechaHoraInicio: new Date('2026-11-20T15:00:00Z'),
    departamento: 'Rocha',
    esOrganizador: true,
  };
  function preparar() {
    const repositorio = new DetallesDeActividadEnMemoria();
    const consulta = jest
      .spyOn(repositorio, 'buscarIniciadasDeParticipante')
      .mockResolvedValue({ actividades: [actividad], hayMas: true });
    return { servicio: new ActividadesServicio({ actividades: repositorio }), consulta };
  }

  it('FP: usa la identidad autenticada, páginas de diez y el plazo del detalle', async () => {
    const { servicio, consulta } = preparar();
    await expect(servicio.obtenerIniciadas('usuario-de-sesion', 2)).resolves.toEqual({
      actividades: [
        {
          ...actividad,
          estado: 'iniciada',
          fechaHoraInicio: '2026-11-20T15:00:00.000Z',
          fechaLimiteGastos: '2026-12-04T15:00:00.000Z',
        },
      ],
      pagina: 2,
      hayMas: true,
    });
    expect(consulta).toHaveBeenCalledWith('usuario-de-sesion', 2, 10);
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it('E1: devuelve una lista vacía válida', async () => {
    const { servicio, consulta } = preparar();
    consulta.mockResolvedValue({ actividades: [], hayMas: false });
    await expect(servicio.obtenerIniciadas('sin-actividades', 1)).resolves.toEqual({ actividades: [], pagina: 1, hayMas: false });
  });

  it('ER1: propaga una falla técnica para el manejador central, sin fingir un vacío', async () => {
    const { servicio, consulta } = preparar();
    consulta.mockRejectedValue(new Error('Base no disponible'));
    await expect(servicio.obtenerIniciadas('usuario', 1)).rejects.toThrow('Base no disponible');
  });

  it('RN1: no permite elegir otra identidad por query', () => {
    expect(esquemaPaginaIniciadas.parse({ usuarioId: 'ajeno' })).toEqual({ pagina: 1 });
  });

  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992'])('rechaza una página inválida: %s', (pagina) => {
    expect(esquemaPaginaIniciadas.safeParse({ pagina }).success).toBe(false);
  });
});
