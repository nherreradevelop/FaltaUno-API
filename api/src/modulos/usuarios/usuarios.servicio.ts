import { errores } from '../../comun/errores';
import type { ActividadesRepositorio } from '../actividades/actividades.repositorio';
import { aUsuarioSesionDto, type UsuarioSesionDto } from '../auth/auth.dto';
import type { DeportesRepositorio } from '../deportes/deportes.repositorio';
import type { ValoracionesRepositorio } from '../valoraciones/valoraciones.repositorio';
import type { Usuario } from './usuario.entidad';
import {
  aHistorialDto,
  aPerfilPropioDto,
  aPerfilPublicoDto,
  TAMANO_PAGINA_HISTORIAL,
  type HistorialDto,
  type PerfilDto,
} from './usuarios.dto';
import type { UsuariosRepositorio } from './usuarios.repositorio';

/** Solo los métodos que usa este servicio: permite probarlo con dobles en memoria. */
export interface DependenciasUsuarios {
  usuarios: Pick<UsuariosRepositorio, 'buscarPorId'>;
  deportes: Pick<DeportesRepositorio, 'buscarActivosDeUsuario'>;
  valoraciones: Pick<ValoracionesRepositorio, 'resumenRecibido'>;
  actividades: Pick<ActividadesRepositorio, 'buscarHistorialDeParticipante' | 'contarHistorialDeParticipante'>;
}

/** La sesión puede seguir viva en Redis aunque la cuenta ya no esté activa: el cliente cierra la sesión local. */
function sesionInvalida() {
  return errores.noAutenticado('SESION_INVALIDA', 'Tu sesión venció. Iniciá sesión de nuevo.');
}

/** CU04 E1: el usuario no existe o cerró su cuenta (CU33). También se usa para un id con formato inválido. */
export function perfilNoDisponible() {
  return errores.noEncontrado('PERFIL_NO_DISPONIBLE', 'Este perfil no está disponible.');
}

export class UsuariosServicio {
  constructor(private readonly dependencias: DependenciasUsuarios) {}

  /** Usuario de la sesión actual. Lo usan web y mobile al abrirse para restaurar la sesión (CU01 RN4). */
  async obtenerUsuarioActual(usuarioId: string): Promise<UsuarioSesionDto> {
    const usuario = await this.dependencias.usuarios.buscarPorId(usuarioId);
    if (usuario === null) {
      throw sesionInvalida();
    }
    return aUsuarioSesionDto(usuario);
  }

  /**
   * CU04 – Visualizar perfil de usuario.
   * Si el perfil es del usuario de la sesión, devuelve el perfil completo (FP); si no, solo la información pública (A1, RN1).
   */
  async obtenerPerfil(idSolicitante: string, idPerfil: string): Promise<PerfilDto> {
    const esPropio = idSolicitante === idPerfil;
    const usuario = await this.dependencias.usuarios.buscarPorId(idPerfil);

    if (usuario === null && esPropio) {
      throw sesionInvalida();
    }
    if (usuario === null) {
      throw perfilNoDisponible(); // CU04 E1
    }

    return this.armarPerfil(usuario, esPropio);
  }

  /** CU04 FP paso 2: historial de actividades del propio usuario, de a TAMANO_PAGINA_HISTORIAL. */
  async obtenerHistorial(usuarioId: string, pagina: number): Promise<HistorialDto> {
    const paginaDeHistorial = await this.dependencias.actividades.buscarHistorialDeParticipante(
      usuarioId,
      pagina,
      TAMANO_PAGINA_HISTORIAL,
    );
    return aHistorialDto(paginaDeHistorial, pagina);
  }

  /** Las consultas son independientes: se hacen en paralelo. */
  private async armarPerfil(usuario: Usuario, esPropio: boolean): Promise<PerfilDto> {
    const { deportes, valoraciones, actividades } = this.dependencias;

    if (esPropio) {
      const [deportesDelUsuario, resumenDeValoraciones] = await Promise.all([
        deportes.buscarActivosDeUsuario(usuario.id),
        valoraciones.resumenRecibido(usuario.id), // CU04 RN3
      ]);
      return aPerfilPropioDto(usuario, deportesDelUsuario, resumenDeValoraciones);
    }

    // CU04 A1: en el perfil público se muestra cuántas actividades tiene, no cuáles
    const [deportesDelUsuario, resumenDeValoraciones, cantidadActividades] = await Promise.all([
      deportes.buscarActivosDeUsuario(usuario.id),
      valoraciones.resumenRecibido(usuario.id), // CU04 RN3
      actividades.contarHistorialDeParticipante(usuario.id),
    ]);
    return aPerfilPublicoDto(usuario, deportesDelUsuario, resumenDeValoraciones, cantidadActividades);
  }
}
