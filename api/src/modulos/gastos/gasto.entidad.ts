import { AppError, errores } from '../../comun/errores';

export interface PersonaGasto {
  id: string;
  participacionId: string;
  invitadoId: string | null;
  usuarioId: string | null;
  nombre: string;
  responsable: string;
}
export interface ParteGasto {
  personaId: string;
  participacionId: string;
  montoCentesimos: number;
}
export const MAXIMO_MONTO_CENTESIMOS = 999_999_999_999; // Capacidad de NUMERIC(12,2).

/** CU23 RN3–RN6 / CU24 RN4–RN7: dinero exacto y reparto aprobado en D1. */
export class Gasto {
  constructor(
    readonly montoCentesimos: number,
    readonly personas: PersonaGasto[],
  ) {}

  repartir(): ParteGasto[] {
    if (
      !Number.isSafeInteger(this.montoCentesimos) ||
      this.montoCentesimos <= 0 ||
      this.montoCentesimos > MAXIMO_MONTO_CENTESIMOS
    ) {
      throw errores.validacion({ montoCentesimos: 'Ingresá un monto mayor que cero, con hasta dos decimales.' });
    }
    if (!this.personas.length) throw errores.validacion({ participantes: 'Seleccioná al menos un participante.' });
    if (new Set(this.personas.map((p) => p.id)).size !== this.personas.length) {
      throw errores.validacion({ participantes: 'Una persona no puede repetirse en el reparto.' });
    }
    const ordenadas = [...this.personas].sort((a, b) => {
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    const base = Math.floor(this.montoCentesimos / ordenadas.length);
    const resto = this.montoCentesimos % ordenadas.length;
    return ordenadas.map((p, indice) => ({
      personaId: p.id,
      participacionId: p.participacionId,
      montoCentesimos: base + (indice < resto ? 1 : 0),
    }));
  }
}

export interface MovimientoBalance {
  deudorId: string;
  acreedorId: string;
  montoCentesimos: number;
}

/** Compensa deudas por pareja; BigInt evita pérdida de centésimos al acumular muchos gastos. */
export function calcularBalances(movimientos: MovimientoBalance[]): MovimientoBalance[] {
  const parejas = new Map<string, { menor: string; mayor: string; monto: bigint }>();
  for (const movimiento of movimientos) {
    if (movimiento.deudorId === movimiento.acreedorId) continue;
    const [menor, mayor] = [movimiento.deudorId, movimiento.acreedorId].sort();
    const clave = `${menor}:${mayor}`;
    const pareja = parejas.get(clave) ?? { menor, mayor, monto: 0n };
    pareja.monto += BigInt(movimiento.montoCentesimos) * (movimiento.deudorId === menor ? 1n : -1n);
    parejas.set(clave, pareja);
  }
  return [...parejas.values()]
    .filter((p) => p.monto !== 0n)
    .map((p) => {
      const absoluto = p.monto < 0n ? -p.monto : p.monto;
      if (absoluto > BigInt(MAXIMO_MONTO_CENTESIMOS))
        throw new AppError(
          409,
          'BALANCE_FUERA_DE_RANGO',
          'El balance supera la capacidad del sistema. La operación no se guardó.',
        );
      return {
        deudorId: p.monto > 0n ? p.menor : p.mayor,
        acreedorId: p.monto > 0n ? p.mayor : p.menor,
        montoCentesimos: Number(absoluto),
      };
    });
}

/** Conversión exacta de NUMERIC de pg, sin multiplicar decimales de coma flotante. */
export function aCentesimos(decimal: string): number {
  const [entero, fraccion = ''] = decimal.split('.');
  return Number(BigInt(entero) * 100n + BigInt(fraccion.padEnd(2, '0')));
}

export function aDecimal(centesimos: number): string {
  return `${Math.trunc(centesimos / 100)}.${String(centesimos % 100).padStart(2, '0')}`;
}
