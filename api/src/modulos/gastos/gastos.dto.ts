import { z } from 'zod';
import { MAXIMO_MONTO_CENTESIMOS, type ParteGasto, type PersonaGasto } from './gasto.entidad';

export const esquemaPersonaGasto = z.string().regex(/^[pi]:[0-9a-f-]{36}$/i, 'Seleccioná una persona de la actividad.');
export const esquemaDatosGasto = z
  .object({
    concepto: z.string().trim().min(1, 'Ingresá el concepto.').max(150, 'El concepto admite hasta 150 caracteres.'),
    montoCentesimos: z
      .number({ required_error: 'Ingresá el monto.', invalid_type_error: 'Ingresá un monto válido.' })
      .int('El monto admite hasta dos decimales.')
      .positive('Ingresá un monto mayor que cero.')
      .max(MAXIMO_MONTO_CENTESIMOS, 'El monto supera la capacidad del sistema.'),
    pagadorId: esquemaPersonaGasto,
    participantes: z.array(esquemaPersonaGasto).min(1, 'Seleccioná al menos un participante.'),
  })
  .strict();
export const esquemaVersionGasto = z
  .number({
    required_error: 'Volvé a cargar el gasto antes de confirmar.',
    invalid_type_error: 'Volvé a cargar el gasto antes de confirmar.',
  })
  .int('Volvé a cargar el gasto antes de confirmar.')
  .positive('Volvé a cargar el gasto antes de confirmar.')
  .max(2_147_483_646, 'No se puede modificar esta versión del gasto.');
export const esquemaEditarGasto = esquemaDatosGasto.extend({ version: esquemaVersionGasto });
export const esquemaEliminarGasto = z.object({ version: esquemaVersionGasto }).strict();
export const esquemaIdGasto = z.string().uuid('La referencia solicitada no es válida.');
export const esquemaOperacionGasto = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{16,128}$/, 'No pudimos identificar este intento. Volvé a verificar su resultado.');
export const esquemaPaginaGasto = z.object({ cursor: z.string().max(250).optional() });
export const esquemaCursorGasto = z.object({ fecha: z.string().datetime(), id: z.string().uuid() });
export type DatosGasto = z.infer<typeof esquemaDatosGasto>;
export interface GastoDto {
  id: string;
  actividadId: string;
  registradoPorId: string;
  concepto: string;
  montoCentesimos: number;
  pagadorId: string;
  version: number;
  fechaRegistro: string;
  eliminado: boolean;
  partes: ParteGasto[];
}
export interface BalanceDto {
  deudorId: string;
  acreedorId: string;
  montoCentesimos: number;
}
export interface ResultadoGasto {
  gasto: GastoDto;
  sinCambios: boolean;
}
export interface OpcionesGasto {
  personas: PersonaGasto[];
  puedeEscribir: boolean;
  motivo: string | null;
  participacionActualId: string;
}
export interface PaginaGastos {
  gastos: GastoDto[];
  siguienteCursor: string | null;
  opciones: OpcionesGasto;
}
export type AccionGasto = 'registrar' | 'editar' | 'eliminar';
