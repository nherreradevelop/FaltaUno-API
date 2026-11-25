import { Pago } from '../src/modulos/pagos/pago.entidad';
describe('CU26 – Pago', () => {
  it('FP/RN3: permite total, parcial y un centésimo sin redondear', () => {
    for (const monto of [1, 199, 300]) expect(() => new Pago(monto).validar(300)).not.toThrow();
  });
  it.each([NaN, Infinity, 0, -1, 1.1, 301, Number.MAX_SAFE_INTEGER])('E1: rechaza %p e informa máximo', (monto) => {
    expect(() => new Pago(monto).validar(300)).toThrow('hasta $ 3.00');
  });
  it('E2: rechaza deuda cero', () => {
    expect(() => new Pago(1).validar(0)).toThrow('No existe una deuda pendiente');
  });
});
