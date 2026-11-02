import { AppError } from '../src/comun/errores';
import type { ActividadDelHistorial } from '../src/modulos/actividades/actividades.repositorio';
import { validar } from '../src/comun/validacion';
import { esquemaPaginaHistorial, TAMANO_PAGINA_HISTORIAL } from '../src/modulos/usuarios/usuarios.dto';
import { UsuariosServicio, type DependenciasUsuarios } from '../src/modulos/usuarios/usuarios.servicio';
import {
  ActividadesEnMemoria,
  crearDeporte,
  crearUsuarioGuardado,
  DeportesEnMemoria,
  UsuariosEnMemoria,
  ValoracionesEnMemoria,
} from './dobles';

const ANA = 'usuario-1';
const BRUNO = 'usuario-2';

function crearServicio(cambios: Partial<DependenciasUsuarios> = {}) {
  const dependencias: DependenciasUsuarios = {
    usuarios: new UsuariosEnMemoria([
      crearUsuarioGuardado({ biografia: 'Surfeo los fines de semana.' }),
      crearUsuarioGuardado({ id: BRUNO, nombre: 'Bruno Silva', email: 'bruno@faltauno.uy', biografia: 'Ciclista.' }),
    ]),
    deportes: new DeportesEnMemoria({ [ANA]: [crearDeporte(1, 'Surf')], [BRUNO]: [crearDeporte(3, 'Ciclismo')] }),
    valoraciones: new ValoracionesEnMemoria({ [BRUNO]: 4.67 }),
    actividades: new ActividadesEnMemoria({ [BRUNO]: crearHistorial(3) }),
    ...cambios,
  };
  return new UsuariosServicio(dependencias);
}

function crearHistorial(cantidad: number): ActividadDelHistorial[] {
  return Array.from({ length: cantidad }, (_, indice) => ({
    id: `actividad-${indice + 1}`,
    nombre: `Salida ${indice + 1}`,
    deporte: 'Surf',
    fechaHoraInicio: new Date(Date.UTC(2026, 9, 30 - indice, 10)),
    estado: indice % 2 === 0 ? 'archivada' : 'cancelada',
  }));
}

describe('Usuario de la sesión actual (GET /api/usuarios/yo)', () => {
  it('devuelve los datos públicos del usuario de la sesión', async () => {
    await expect(crearServicio().obtenerUsuarioActual(ANA)).resolves.toEqual({
      id: ANA,
      nombre: 'Ana Pérez',
      email: 'ana@faltauno.uy',
      fotoUrl: null,
    });
  });

  it('si la cuenta ya no está activa responde 401 para que el cliente cierre la sesión', async () => {
    const servicio = crearServicio({ usuarios: new UsuariosEnMemoria([]) });
    await expect(servicio.obtenerUsuarioActual(ANA)).rejects.toMatchObject({ estado: 401, codigo: 'SESION_INVALIDA' });
    await expect(servicio.obtenerUsuarioActual(ANA)).rejects.toBeInstanceOf(AppError);
  });
});

describe('CU04 – Visualizar perfil de usuario', () => {
  it('FP: el perfil propio incluye nombre, foto, biografía, deportes, valoración, correo y esPropio', async () => {
    await expect(crearServicio().obtenerPerfil(ANA, ANA)).resolves.toEqual({
      id: ANA,
      nombre: 'Ana Pérez',
      email: 'ana@faltauno.uy',
      fotoUrl: null,
      biografia: 'Surfeo los fines de semana.',
      deportes: [{ id: 1, nombre: 'Surf' }],
      valoracionPromedio: null,
      esPropio: true,
    });
  });

  it('FP / RN3: sin valoraciones, el promedio es null', async () => {
    const perfil = await crearServicio().obtenerPerfil(ANA, ANA);
    expect(perfil.valoracionPromedio).toBeNull();
  });

  it('FP: si la cuenta de la sesión ya no está activa responde 401', async () => {
    const servicio = crearServicio({ usuarios: new UsuariosEnMemoria([]) });
    await expect(servicio.obtenerPerfil(ANA, ANA)).rejects.toMatchObject({ estado: 401, codigo: 'SESION_INVALIDA' });
  });

  it('A1 / RN1: el perfil de otro usuario muestra la información pública, sin correo y sin edición (RN2)', async () => {
    const perfil = await crearServicio().obtenerPerfil(ANA, BRUNO);
    expect(perfil).toEqual({
      id: BRUNO,
      nombre: 'Bruno Silva',
      fotoUrl: null,
      biografia: 'Ciclista.',
      deportes: [{ id: 3, nombre: 'Ciclismo' }],
      valoracionPromedio: 4.67,
      cantidadActividades: 3,
      esPropio: false,
    });
    expect(perfil).not.toHaveProperty('email');
  });

  it('A1: sin actividades terminadas, la cantidad es 0', async () => {
    const servicio = crearServicio({ actividades: new ActividadesEnMemoria() });
    await expect(servicio.obtenerPerfil(ANA, BRUNO)).resolves.toMatchObject({ cantidadActividades: 0 });
  });

  it('E1: si el usuario no existe o cerró su cuenta → 404 PERFIL_NO_DISPONIBLE', async () => {
    await expect(crearServicio().obtenerPerfil(ANA, 'usuario-inexistente')).rejects.toMatchObject({
      estado: 404,
      codigo: 'PERFIL_NO_DISPONIBLE',
    });
  });

  it('ER1: si falla la base al cargar el perfil, el error se propaga y no se devuelve un perfil incompleto', async () => {
    const valoracionesQueFallan = {
      promedioRecibido: async () => {
        throw new Error('conexión perdida con PostgreSQL');
      },
    };
    const servicio = crearServicio({ valoraciones: valoracionesQueFallan });
    await expect(servicio.obtenerPerfil(ANA, BRUNO)).rejects.toThrow('conexión perdida con PostgreSQL');
  });
});

describe('CU04 FP paso 2 – Historial de actividades del perfil propio', () => {
  it(`devuelve la primera página de ${TAMANO_PAGINA_HISTORIAL} actividades e indica si hay más`, async () => {
    const actividades = new ActividadesEnMemoria({ [ANA]: crearHistorial(12) });
    const historial = await crearServicio({ actividades }).obtenerHistorial(ANA, 1);

    expect(historial.pagina).toBe(1);
    expect(historial.hayMas).toBe(true);
    expect(historial.actividades).toHaveLength(TAMANO_PAGINA_HISTORIAL);
    expect(historial.actividades[0]).toEqual({
      id: 'actividad-1',
      nombre: 'Salida 1',
      deporte: 'Surf',
      fechaHoraInicio: '2026-10-30T10:00:00.000Z',
      estado: 'archivada',
    });
    expect(actividades.pedidos).toEqual([{ usuarioId: ANA, pagina: 1, tamanoPagina: TAMANO_PAGINA_HISTORIAL }]);
  });

  it('la última página trae el resto y hayMas es false', async () => {
    const actividades = new ActividadesEnMemoria({ [ANA]: crearHistorial(12) });
    const historial = await crearServicio({ actividades }).obtenerHistorial(ANA, 2);

    expect(historial.actividades.map((actividad) => actividad.id)).toEqual(['actividad-11', 'actividad-12']);
    expect(historial.hayMas).toBe(false);
  });

  it('sin actividades terminadas devuelve una lista vacía', async () => {
    const historial = await crearServicio().obtenerHistorial(ANA, 1);
    expect(historial).toEqual({ actividades: [], pagina: 1, hayMas: false });
  });

  it('la página es 1 si no se indica, y se rechaza una página inválida con 400', () => {
    expect(validar(esquemaPaginaHistorial, {})).toEqual({ pagina: 1 });
    expect(validar(esquemaPaginaHistorial, { pagina: '3' })).toEqual({ pagina: 3 });
    expect(() => validar(esquemaPaginaHistorial, { pagina: '0' })).toThrow(expect.objectContaining({ estado: 400 }));
    expect(() => validar(esquemaPaginaHistorial, { pagina: 'abc' })).toThrow(expect.objectContaining({ estado: 400 }));
  });
});
