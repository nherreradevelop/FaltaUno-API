import { crearActividad } from './dobles';

describe('Actividad (entidad)', () => {
  it('RN3 / RN7: los cupos libres descuentan participantes, organizador e invitados externos', () => {
    expect(crearActividad({ cupoMaximo: 6, lugaresOcupados: 4 }).cuposLibres()).toBe(2);
  });

  it('una actividad completa tiene 0 cupos libres, nunca un número negativo', () => {
    expect(crearActividad({ cupoMaximo: 3, lugaresOcupados: 3 }).cuposLibres()).toBe(0);
    expect(crearActividad({ cupoMaximo: 3, lugaresOcupados: 4 }).cuposLibres()).toBe(0);
  });

  it('indica si la organiza un usuario', () => {
    const actividad = crearActividad({ organizadorId: 'usuario-1' });
    expect(actividad.esOrganizadaPor('usuario-1')).toBe(true);
    expect(actividad.esOrganizadaPor('usuario-2')).toBe(false);
  });

  it('una actividad cuyo organizador cerró su cuenta no es de nadie', () => {
    expect(crearActividad({ organizadorId: null }).esOrganizadaPor('usuario-1')).toBe(false);
  });
});
