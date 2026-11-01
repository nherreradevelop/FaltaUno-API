import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../comun/errores';
import type { Logger } from './logger';

/** Identidad confirmada por el proveedor externo (CU01 A1 paso 4). */
export interface IdentidadExterna {
  proveedorId: string;
  email: string;
}

// RNF-08: si Google no responde a tiempo, se corta (CU01 ER2)
const TIEMPO_GOOGLE_MS = 10_000;

/** Respuestas de CU01 ER2: un mismo mensaje al usuario, con códigos distintos para el log. */
const MENSAJE_ERROR_GOOGLE =
  'No fue posible iniciar sesión con Google en este momento. Reintentá o ingresá con tu correo y contraseña.';

function errorDeGoogle(estado: number, codigo: string): AppError {
  return new AppError(estado, codigo, MENSAJE_ERROR_GOOGLE);
}

/** Las fallas de red no son culpa del token: se distinguen para responder 503 y no 401. */
function esFallaDeRed(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const codigo = (error as Error & { code?: unknown }).code;
  return typeof codigo === 'string' && ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(codigo);
}

function rechazarTrasTiempoLimite(milisegundos: number): Promise<never> {
  return new Promise((_resolver, rechazar) => {
    setTimeout(() => rechazar(errorDeGoogle(503, 'GOOGLE_SIN_RESPUESTA')), milisegundos).unref();
  });
}

/**
 * Verifica el ID token que el cliente obtuvo de Google: firma, emisor, vencimiento, Client ID (audiencia)
 * y que el correo esté verificado. La API no confía en ningún otro dato que mande el cliente.
 */
export class VerificadorGoogle {
  private readonly cliente = new OAuth2Client();

  constructor(
    private readonly clientIds: string[],
    private readonly logger: Logger,
  ) {}

  async verificar(idToken: string): Promise<IdentidadExterna> {
    if (this.clientIds.length === 0) {
      this.logger.error({ evento: 'google_sin_configurar' }, 'GOOGLE_CLIENT_IDS está vacío en api/.env');
      throw errorDeGoogle(503, 'GOOGLE_SIN_CONFIGURAR');
    }

    const verificacion = this.cliente.verifyIdToken({ idToken, audience: this.clientIds });
    let datos;
    try {
      const ticket = await Promise.race([verificacion, rechazarTrasTiempoLimite(TIEMPO_GOOGLE_MS)]);
      datos = ticket.getPayload();
    } catch (error) {
      if (error instanceof AppError) {
        this.logger.warn({ evento: 'google_sin_respuesta' }, 'Google no respondió a tiempo al verificar el ID token');
        throw error;
      }
      if (esFallaDeRed(error)) {
        this.logger.error(
          { evento: 'google_inalcanzable', err: error },
          'No se pudo contactar a Google para verificar el ID token',
        );
        throw errorDeGoogle(503, 'GOOGLE_NO_DISPONIBLE');
      }
      this.logger.warn({ evento: 'google_token_invalido', motivo: (error as Error).message }, 'ID token de Google rechazado');
      throw errorDeGoogle(401, 'TOKEN_GOOGLE_INVALIDO');
    }

    if (!datos?.sub || !datos.email || datos.email_verified !== true) {
      this.logger.warn({ evento: 'google_correo_no_verificado' }, 'El ID token de Google no trae un correo verificado');
      throw errorDeGoogle(401, 'CORREO_GOOGLE_NO_VERIFICADO');
    }

    return { proveedorId: datos.sub, email: datos.email };
  }
}
