import { aCentesimos, aDecimal, calcularBalances, Gasto, type PersonaGasto } from '../src/modulos/gastos/gasto.entidad';

const persona = (id: string, participacionId = id): PersonaGasto => ({
  id,
  participacionId,
  invitadoId: null,
  usuarioId: id,
  nombre: id,
  responsable: id,
});
describe('CU23–CU25 – dinero y balances', () => {
  it('CU23 RN6: reparte el resto en orden estable, sin depender de la selección', () => {
    const reparto = new Gasto(100, [persona('c'), persona('a'), persona('b')]).repartir();
    expect(reparto.map((p) => p.montoCentesimos)).toEqual([34, 33, 33]);
    expect(reparto.map((p) => p.personaId)).toEqual(['a', 'b', 'c']);
  });
  it('CU23 RN4: mantiene identidad externa y participación responsable', () => {
    expect(new Gasto(1, [persona('i:invitado', 'responsable'), persona('p:otro')]).repartir()).toEqual([
      { personaId: 'i:invitado', participacionId: 'responsable', montoCentesimos: 1 },
      { personaId: 'p:otro', participacionId: 'p:otro', montoCentesimos: 0 },
    ]);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 1_000_000_000_000])('CU23 E1: rechaza monto %p', (monto) => {
    expect(() => new Gasto(monto, [persona('a')]).repartir()).toThrow();
  });
  it('CU23 E2/RN5: rechaza selección vacía y duplicados', () => {
    expect(() => new Gasto(100, []).repartir()).toThrow();
    expect(() => new Gasto(100, [persona('a'), persona('a')]).repartir()).toThrow();
  });
  it('CU24 RN6 / CU25 RN4: compensa por pareja e ignora partes propias', () => {
    expect(
      calcularBalances([
        { deudorId: 'a', acreedorId: 'b', montoCentesimos: 100 },
        { deudorId: 'b', acreedorId: 'a', montoCentesimos: 150 },
        { deudorId: 'a', acreedorId: 'a', montoCentesimos: 900 },
      ]),
    ).toEqual([{ deudorId: 'b', acreedorId: 'a', montoCentesimos: 50 }]);
    expect(
      calcularBalances([
        { deudorId: 'a', acreedorId: 'b', montoCentesimos: 100 },
        { deudorId: 'b', acreedorId: 'a', montoCentesimos: 100 },
      ]),
    ).toEqual([]);
  });
  it('RN6: no aplica simplificaciones entre tres personas', () => {
    expect(
      calcularBalances([
        { deudorId: 'a', acreedorId: 'b', montoCentesimos: 100 },
        { deudorId: 'b', acreedorId: 'c', montoCentesimos: 100 },
      ]),
    ).toHaveLength(2);
  });
  it('capacidad SQL: revierte un balance fuera de NUMERIC(12,2)', () => {
    expect(() =>
      calcularBalances([
        { deudorId: 'a', acreedorId: 'b', montoCentesimos: 999999999999 },
        { deudorId: 'a', acreedorId: 'b', montoCentesimos: 1 },
      ]),
    ).toThrow();
  });
  it.each(['0.01', '1234567890.99', '9999999999.99', '4.00', '12.30'])('conversión exacta de %s', (decimal) => {
    expect(aDecimal(aCentesimos(decimal))).toBe(decimal);
  });
});
