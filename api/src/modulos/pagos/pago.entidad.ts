import { AppError } from '../../comun/errores';
import { aDecimal, MAXIMO_MONTO_CENTESIMOS } from '../gastos/gasto.entidad';

/** CU26 RN2–RN3: un pago reduce una deuda vigente, con centésimos enteros. */
export class Pago {
  constructor(readonly montoCentesimos: number) {}

  validar(deudaCentesimos: number): void {
    if (deudaCentesimos <= 0) throw new AppError(409, 'SIN_DEUDA_PENDIENTE', 'No existe una deuda pendiente para registrar.');
    if (
      !Number.isSafeInteger(this.montoCentesimos) ||
      this.montoCentesimos <= 0 ||
      this.montoCentesimos > deudaCentesimos ||
      this.montoCentesimos > MAXIMO_MONTO_CENTESIMOS
    ) {
      const maximo = aDecimal(Math.min(deudaCentesimos, MAXIMO_MONTO_CENTESIMOS));
      const mensaje = `Ingresá un monto mayor que cero y de hasta $ ${maximo}.`;
      throw new AppError(400, 'MONTO_PAGO_INVALIDO', mensaje, { montoCentesimos: mensaje });
    }
  }
}
