import { errores } from '../../comun/errores';
import { aUsuarioSesionDto, type UsuarioSesionDto } from '../auth/auth.dto';
import type { UsuariosRepositorio } from './usuarios.repositorio';

export class UsuariosServicio {
  constructor(private readonly usuarios: Pick<UsuariosRepositorio, 'buscarPorId'>) {}

  /**
   * Usuario de la sesión actual. Lo usan web y mobile al abrirse para restaurar la sesión (CU01 RN4).
   * Pendiente: CU04 – datos completos del perfil.
   */
  async obtenerUsuarioActual(usuarioId: string): Promise<UsuarioSesionDto> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    // La sesión puede seguir viva en Redis aunque la cuenta ya no esté activa
    if (usuario === null) {
      throw errores.noAutenticado('SESION_INVALIDA', 'Tu sesión venció. Iniciá sesión de nuevo.');
    }
    return aUsuarioSesionDto(usuario);
  }
}
