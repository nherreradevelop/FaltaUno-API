import { z } from 'zod';
import type { BalanceDto, OpcionesGasto, AccionGasto } from '../gastos/gastos.dto';

// El servicio valida el importe contra la deuda vigente para informar siempre su máximo (E1).
export const esquemaMontoPago = z.object({ montoCentesimos: z.unknown() }).strict();
export const esquemaDatosPago = esquemaMontoPago.extend({
  pagadorId: z.string().uuid('Seleccioná al participante que pagó.'),
  receptorId: z.string().uuid('Seleccioná al participante que cobró.'),
});
export const esquemaEditarPago = esquemaMontoPago.extend({
  version: z
    .number({
      required_error: 'Volvé a cargar el pago antes de confirmar.',
      invalid_type_error: 'Volvé a cargar el pago antes de confirmar.',
    })
    .int('La versión del pago no es válida.')
    .positive('La versión del pago no es válida.')
    .max(2_147_483_646, 'No se puede modificar esta versión del pago.'),
});
export interface DatosPago {
  pagadorId?: string;
  receptorId?: string;
  montoCentesimos?: unknown;
}
export interface PagoDto {
  id: string;
  actividadId: string;
  pagadorId: string;
  receptorId: string;
  registradoPorId: string;
  montoCentesimos: number;
  version: number;
  fechaRegistro: string;
  eliminado: boolean;
}
export interface ResultadoPago {
  pago: PagoDto;
  sinCambios: boolean;
}
export interface OpcionesPago extends OpcionesGasto {
  deudas: BalanceDto[];
  historialVencido: boolean;
  historialHasta: string | null;
}
export type AccionPago = AccionGasto;
