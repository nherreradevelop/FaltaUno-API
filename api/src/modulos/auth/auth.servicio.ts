import { errores } from '../../comun/errores';
import { compararPassword } from '../../comun/passwords';
import type { VerificadorGoogle } from '../../infra/oauth';
import type { Logger } from '../../infra/logger';
import type { Usuario } from '../usuarios/usuario.entidad';
import type { UsuariosRepositorio } from '../usuarios/usuarios.repositorio';
import { aRespuestaLoginDto, type DatosLogin, type DatosLoginGoogle, type RespuestaLoginDto } from './auth.dto';
import type { BloqueosRepositorio } from './bloqueos.repositorio';
import type { SesionesRepositorio } from './sesiones.repositorio';

/** Solo los métodos que usa este servicio: permite probarlo con dobles en memoria. */
export interface DependenciasAuth {
  usuarios: Pick<
    UsuariosRepositorio,
    | 'buscarPorEmail'
    | 'registrarIntentoFallido'
    | 'reiniciarIntentosFallidos'
    | 'verificarYVincularProveedor'
    | 'guardarProveedorId'
  >;
  sesiones: Pick<SesionesRepositorio, 'crear' | 'cerrarTodas'>;
  bloqueos: Pick<BloqueosRepositorio, 'minutosDeBloqueoRestantes' | 'registrarIntentoFallido'>;
  verificadorGoogle: Pick<VerificadorGoogle, 'verificar'>;
  logger: Logger;
  maximoIntentos: number;
  minutosDeBloqueo: number;
}

/** CU01 E3: el mismo mensaje para correo inexistente y contraseña incorrecta (RNF-12). */
function credencialesIncorrectas() {
  return errores.noAutenticado('CREDENCIALES_INCORRECTAS', 'El correo o la contraseña son incorrectos.');
}

/** CU01 E4. */
function demasiadosIntentos(minutosRestantes: number) {
  const unidad = minutosRestantes === 1 ? 'minuto' : 'minutos';
  return errores.demasiadosIntentos(
    'DEMASIADOS_INTENTOS',
    `Superaste los intentos permitidos. Probá de nuevo en ${minutosRestantes} ${unidad} o recuperá tu contraseña.`,
  );
}

export class AuthServicio {
  constructor(private readonly dependencias: DependenciasAuth) {}

  /** CU01 – Inicio de sesión con correo y contraseña (flujo principal). */
  async iniciarSesion(datos: DatosLogin): Promise<RespuestaLoginDto> {
    const { usuarios, sesiones } = this.dependencias;
    const usuario = await usuarios.buscarPorEmail(datos.email);

    if (usuario === null) {
      return this.rechazarCorreoInexistente(datos);
    }

    // CU01 E4: mientras dura el bloqueo no se evalúa la contraseña
    if (usuario.estaBloqueado()) {
      throw demasiadosIntentos(usuario.minutosDeBloqueoRestantes());
    }

    const passwordCorrecta = await usuario.coincidePassword(datos.password);
    if (!passwordCorrecta) {
      return this.registrarIntentoFallido(usuario);
    }

    // CU01 RN3: un ingreso correcto reinicia los intentos consecutivos
    if (usuario.tieneIntentosRegistrados()) {
      await usuarios.reiniciarIntentosFallidos(usuario.id);
    }

    // CU01 E1 / RN1: las credenciales son correctas pero falta verificar el correo
    if (!usuario.verificado) {
      // Pendiente: CU02 – reenviar el correo de verificación (E1 paso 3)
      throw errores.prohibido('CUENTA_NO_VERIFICADA', 'Tenés que verificar tu correo electrónico antes de iniciar sesión.');
    }

    const sesion = await sesiones.crear(usuario.id);
    this.dependencias.logger.info({ evento: 'login_correcto', usuarioId: usuario.id, proveedor: 'local' }, 'Inicio de sesión');
    return aRespuestaLoginDto(usuario, sesion);
  }

  /** CU01 A1 – Inicio de sesión con Google. */
  async iniciarSesionConGoogle(datos: DatosLoginGoogle): Promise<RespuestaLoginDto> {
    const { usuarios, sesiones, verificadorGoogle } = this.dependencias;
    const identidad = await verificadorGoogle.verificar(datos.idToken);

    // CU01 RN5: la cuenta se identifica por el correo verificado que informa Google
    const usuario = await usuarios.buscarPorEmail(identidad.email);
    if (usuario === null) {
      // CU01 E2. Pendiente: CU02 A3 – ofrecer el registro con la misma cuenta de Google
      throw errores.noEncontrado(
        'CUENTA_NO_ENCONTRADA',
        'No encontramos una cuenta asociada a tu cuenta de Google. Podés registrarte con esa misma cuenta.',
      );
    }

    // Pendiente: consultar si el bloqueo por intentos fallidos (E4) también impide ingresar con Google
    await this.vincularGoogle(usuario, identidad.proveedorId);

    const sesion = await sesiones.crear(usuario.id);
    this.dependencias.logger.info({ evento: 'login_correcto', usuarioId: usuario.id, proveedor: 'google' }, 'Inicio de sesión');
    return aRespuestaLoginDto(usuario, sesion);
  }

  /** CU01 E3 / E4 para un correo que no está registrado: misma respuesta que para una cuenta existente (RNF-12). Siempre lanza. */
  private async rechazarCorreoInexistente(datos: DatosLogin): Promise<never> {
    const { bloqueos, maximoIntentos, minutosDeBloqueo } = this.dependencias;

    const minutosRestantes = await bloqueos.minutosDeBloqueoRestantes(datos.email);
    if (minutosRestantes > 0) {
      throw demasiadosIntentos(minutosRestantes);
    }

    // Se compara igual contra un hash para que la respuesta tarde lo mismo que con una cuenta real
    await compararPassword(datos.password, null);

    const quedoBloqueado = await bloqueos.registrarIntentoFallido(datos.email, maximoIntentos, minutosDeBloqueo);
    if (quedoBloqueado) {
      throw demasiadosIntentos(minutosDeBloqueo);
    }
    throw credencialesIncorrectas();
  }

  /** CU01 E3 / E4 para una cuenta existente. Siempre lanza. */
  private async registrarIntentoFallido(usuario: Usuario): Promise<never> {
    const { usuarios, logger, maximoIntentos, minutosDeBloqueo } = this.dependencias;
    const bloqueadoHasta = await usuarios.registrarIntentoFallido(usuario.id, maximoIntentos, minutosDeBloqueo);

    if (bloqueadoHasta !== null) {
      logger.warn(
        { evento: 'cuenta_bloqueada', usuarioId: usuario.id, bloqueadoHasta },
        'Cuenta bloqueada por intentos fallidos',
      );
      throw demasiadosIntentos(minutosDeBloqueo);
    }
    logger.info({ evento: 'login_fallido', usuarioId: usuario.id }, 'Contraseña incorrecta');
    throw credencialesIncorrectas();
  }

  /**
   * CU01 RN5 y RN6. Si la cuenta estaba pendiente de verificación, queda verificada, sin contraseña
   * y con sus sesiones cerradas. Si ya estaba verificada, solo se guarda el identificador de Google
   * (proveedor_auth sigue siendo 'local', así puede seguir entrando con contraseña).
   */
  private async vincularGoogle(usuario: Usuario, proveedorId: string): Promise<void> {
    const { usuarios, sesiones, logger } = this.dependencias;

    if (!usuario.verificado) {
      const seVinculo = await usuarios.verificarYVincularProveedor(usuario.id, proveedorId);
      if (seVinculo) {
        await sesiones.cerrarTodas(usuario.id);
        logger.info(
          { evento: 'cuenta_vinculada_google', usuarioId: usuario.id },
          'Cuenta pendiente verificada al vincular Google (RN6)',
        );
      }
      return;
    }

    if (usuario.proveedorId !== proveedorId) {
      await usuarios.guardarProveedorId(usuario.id, proveedorId);
    }
  }
}
