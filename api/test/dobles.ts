import bcrypt from 'bcrypt';
import type { DependenciasAuth } from '../src/modulos/auth/auth.servicio';
import type { SesionCreada } from '../src/modulos/auth/sesiones.repositorio';
import type { IdentidadExterna } from '../src/infra/oauth';
import { logger } from '../src/infra/logger';
import type { PaginaDeHistorial } from '../src/modulos/actividades/actividades.repositorio';
import { Deporte } from '../src/modulos/deportes/deporte.entidad';
import { Usuario, type ProveedorAuth } from '../src/modulos/usuarios/usuario.entidad';
import type { DependenciasUsuarios } from '../src/modulos/usuarios/usuarios.servicio';

type RepositorioUsuarios = DependenciasAuth['usuarios'];
type RepositorioSesiones = DependenciasAuth['sesiones'];
type RepositorioBloqueos = DependenciasAuth['bloqueos'];
type Verificador = DependenciasAuth['verificadorGoogle'];

/** Estado mutable de un usuario guardado en el repositorio en memoria (equivale a una fila de la tabla). */
export interface UsuarioGuardado {
  id: string;
  nombre: string;
  email: string;
  fotoUrl: string | null;
  biografia: string | null;
  proveedorAuth: ProveedorAuth;
  proveedorId: string | null;
  verificado: boolean;
  passwordHash: string | null;
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
}

export const PASSWORD_CORRECTA = 'Correcta123!';
// Costo bajo solo para que las pruebas sean rápidas
export const HASH_PASSWORD_CORRECTA = bcrypt.hashSync(PASSWORD_CORRECTA, 4);

export function crearUsuarioGuardado(cambios: Partial<UsuarioGuardado> = {}): UsuarioGuardado {
  return {
    id: 'usuario-1',
    nombre: 'Ana Pérez',
    email: 'ana@faltauno.uy',
    fotoUrl: null,
    biografia: null,
    proveedorAuth: 'local',
    proveedorId: null,
    verificado: true,
    passwordHash: HASH_PASSWORD_CORRECTA,
    intentosFallidos: 0,
    bloqueadoHasta: null,
    ...cambios,
  };
}

function aEntidad(guardado: UsuarioGuardado): Usuario {
  return new Usuario(
    guardado.id,
    guardado.nombre,
    guardado.email,
    guardado.fotoUrl,
    guardado.biografia,
    guardado.proveedorAuth,
    guardado.proveedorId,
    guardado.verificado,
    guardado.passwordHash,
    guardado.intentosFallidos,
    guardado.bloqueadoHasta,
  );
}

/** Reproduce en memoria el comportamiento de UsuariosRepositorio. */
export class UsuariosEnMemoria implements RepositorioUsuarios {
  constructor(readonly guardados: UsuarioGuardado[] = []) {}

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const guardado = this.guardados.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return guardado ? aEntidad(guardado) : null;
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    const guardado = this.guardados.find((u) => u.id === id);
    return guardado ? aEntidad(guardado) : null;
  }

  async registrarIntentoFallido(id: string, maximoIntentos: number, minutosDeBloqueo: number): Promise<Date | null> {
    const guardado = this.obtener(id);
    guardado.intentosFallidos += 1;
    if (guardado.intentosFallidos < maximoIntentos) {
      return null;
    }
    guardado.intentosFallidos = 0;
    guardado.bloqueadoHasta = new Date(Date.now() + minutosDeBloqueo * 60_000);
    return guardado.bloqueadoHasta;
  }

  async reiniciarIntentosFallidos(id: string): Promise<void> {
    const guardado = this.obtener(id);
    guardado.intentosFallidos = 0;
    guardado.bloqueadoHasta = null;
  }

  async verificarYVincularProveedor(id: string, proveedorId: string): Promise<boolean> {
    const guardado = this.obtener(id);
    if (guardado.verificado) {
      return false;
    }
    guardado.verificado = true;
    guardado.passwordHash = null;
    guardado.proveedorId = proveedorId;
    return true;
  }

  async guardarProveedorId(id: string, proveedorId: string): Promise<void> {
    this.obtener(id).proveedorId = proveedorId;
  }

  private obtener(id: string): UsuarioGuardado {
    const guardado = this.guardados.find((u) => u.id === id);
    if (!guardado) {
      throw new Error(`El doble no tiene el usuario ${id}`);
    }
    return guardado;
  }
}

export class SesionesEnMemoria implements RepositorioSesiones {
  readonly abiertas = new Map<string, string>(); // token -> usuarioId
  private contador = 0;

  async crear(usuarioId: string): Promise<SesionCreada> {
    this.contador += 1;
    const token = `token-${this.contador}`;
    this.abiertas.set(token, usuarioId);
    return { token, venceEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
  }

  async buscarUsuarioId(token: string): Promise<string | null> {
    return this.abiertas.get(token) ?? null;
  }

  async cerrar(token: string): Promise<string | null> {
    const usuarioId = this.abiertas.get(token) ?? null;
    this.abiertas.delete(token);
    return usuarioId;
  }

  async cerrarTodas(usuarioId: string): Promise<void> {
    for (const [token, dueño] of this.abiertas) {
      if (dueño === usuarioId) {
        this.abiertas.delete(token);
      }
    }
  }
}

/** Reproduce en memoria BloqueosRepositorio (correos sin cuenta). */
export class BloqueosEnMemoria implements RepositorioBloqueos {
  private readonly intentos = new Map<string, number>();
  private readonly bloqueadosHasta = new Map<string, number>();

  async minutosDeBloqueoRestantes(email: string): Promise<number> {
    const hasta = this.bloqueadosHasta.get(email.toLowerCase()) ?? 0;
    const restante = hasta - Date.now();
    return restante > 0 ? Math.ceil(restante / 60_000) : 0;
  }

  async registrarIntentoFallido(email: string, maximoIntentos: number, minutosDeBloqueo: number): Promise<boolean> {
    const clave = email.toLowerCase();
    const intentos = (this.intentos.get(clave) ?? 0) + 1;
    if (intentos < maximoIntentos) {
      this.intentos.set(clave, intentos);
      return false;
    }
    this.intentos.delete(clave);
    this.bloqueadosHasta.set(clave, Date.now() + minutosDeBloqueo * 60_000);
    return true;
  }
}

/** Verificador de Google que devuelve la identidad configurada o lanza el error configurado. */
export class VerificadorGoogleFalso implements Verificador {
  constructor(private readonly resultado: IdentidadExterna | Error) {}

  async verificar(): Promise<IdentidadExterna> {
    if (this.resultado instanceof Error) {
      throw this.resultado;
    }
    return this.resultado;
  }
}

/** Deportes activos por usuario, como los devuelve DeportesRepositorio (ya sin los desactivados). */
export class DeportesEnMemoria implements Pick<DependenciasUsuarios['deportes'], 'buscarActivosDeUsuario'> {
  constructor(private readonly porUsuario: Record<string, Deporte[]> = {}) {}

  async buscarActivosDeUsuario(usuarioId: string): Promise<Deporte[]> {
    return this.porUsuario[usuarioId] ?? [];
  }
}

type RepositorioValoraciones = DependenciasUsuarios['valoraciones'];

/** Puntajes recibidos por usuario; calcula promedio y cantidad como ValoracionesRepositorio. */
export class ValoracionesEnMemoria implements RepositorioValoraciones {
  constructor(private readonly puntajesPorUsuario: Record<string, number[]> = {}) {}

  async resumenRecibido(usuarioId: string): Promise<{ promedio: number | null; cantidad: number }> {
    const puntajes = this.puntajesPorUsuario[usuarioId] ?? [];
    if (puntajes.length === 0) {
      return { promedio: null, cantidad: 0 };
    }
    const suma = puntajes.reduce((total, puntaje) => total + puntaje, 0);
    return { promedio: Math.round((suma / puntajes.length) * 100) / 100, cantidad: puntajes.length };
  }
}

/** Historial ya filtrado (archivadas o canceladas) y ordenado; pagina como lo hace ActividadesRepositorio. */
type RepositorioActividades = DependenciasUsuarios['actividades'];

export class ActividadesEnMemoria implements RepositorioActividades {
  readonly pedidos: { usuarioId: string; pagina: number; tamanoPagina: number }[] = [];

  constructor(private readonly historialPorUsuario: Record<string, PaginaDeHistorial['actividades']> = {}) {}

  async buscarHistorialDeParticipante(usuarioId: string, pagina: number, tamanoPagina: number): Promise<PaginaDeHistorial> {
    this.pedidos.push({ usuarioId, pagina, tamanoPagina });
    const historial = this.historialPorUsuario[usuarioId] ?? [];
    const desde = (pagina - 1) * tamanoPagina;
    return { actividades: historial.slice(desde, desde + tamanoPagina), hayMas: historial.length > desde + tamanoPagina };
  }

  async contarHistorialDeParticipante(usuarioId: string): Promise<number> {
    return (this.historialPorUsuario[usuarioId] ?? []).length;
  }
}

export function crearDeporte(id: number, nombre: string): Deporte {
  return new Deporte(id, nombre);
}

export const MAXIMO_INTENTOS = 5;
export const MINUTOS_DE_BLOQUEO = 15;
export { logger as loggerSilencioso };
