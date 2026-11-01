import { compararPassword } from '../../comun/passwords';

export type ProveedorAuth = 'local' | 'google' | 'apple';

/** Usuario del sistema (diagrama de clases). Los datos sensibles son privados y nunca salen en una respuesta. */
export class Usuario {
  constructor(
    readonly id: string,
    readonly nombre: string,
    readonly email: string,
    readonly fotoUrl: string | null,
    readonly proveedorAuth: ProveedorAuth,
    readonly proveedorId: string | null,
    readonly verificado: boolean,
    private readonly passwordHash: string | null,
    private readonly intentosFallidos: number,
    private readonly bloqueadoHasta: Date | null,
  ) {}

  /** CU01 RN3: bloqueo temporal tras intentos fallidos. */
  estaBloqueado(ahora: Date = new Date()): boolean {
    return this.bloqueadoHasta !== null && this.bloqueadoHasta > ahora;
  }

  /** CU01 E4: minutos que faltan para que termine el bloqueo, redondeados hacia arriba. */
  minutosDeBloqueoRestantes(ahora: Date = new Date()): number {
    if (!this.estaBloqueado(ahora) || this.bloqueadoHasta === null) {
      return 0;
    }
    const milisegundosRestantes = this.bloqueadoHasta.getTime() - ahora.getTime();
    return Math.ceil(milisegundosRestantes / 60_000);
  }

  /** CU01 RN2. Una cuenta sin contraseña (creada con Google o Apple) nunca coincide. */
  coincidePassword(password: string): Promise<boolean> {
    return compararPassword(password, this.passwordHash);
  }

  /** Indica si hay intentos fallidos o un bloqueo vencido que limpiar tras un ingreso correcto. */
  tieneIntentosRegistrados(): boolean {
    return this.intentosFallidos > 0 || this.bloqueadoHasta !== null;
  }
}
