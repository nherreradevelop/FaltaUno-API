import { Actividad, type EstadoActividad, type OpcionDeActividad } from '../src/modulos/actividades/actividad.entidad';
import { aCentesimos } from '../src/modulos/actividades/actividades.repositorio';
import { crearActividad, ORGANIZADORA } from './dobles-actividades';

const INICIO = new Date('2026-11-07T10:30:00.000Z');

function actividadEn(estado: EstadoActividad, cambios: { cupoMaximo?: number; cuposOcupados?: number } = {}): Actividad {
  return crearActividad({ estado, fechaHoraInicio: INICIO, ...cambios });
}

describe('CU09 – Actividad (entidad)', () => {
  describe('FP paso 3: rol del usuario', () => {
    it('el organizador tiene rol organizador aunque también tenga participación', () => {
      expect(actividadEn('programada').rolDe(ORGANIZADORA, true)).toBe('organizador');
    });

    it('quien participa y no organiza es participante', () => {
      expect(actividadEn('programada').rolDe('otro', true)).toBe('participante');
    });

    it('quien no participa no forma parte', () => {
      expect(actividadEn('programada').rolDe('otro', false)).toBe('ninguno');
    });

    it('si el organizador cerró su cuenta, nadie tiene rol organizador', () => {
      const actividad = crearActividad({ organizadorId: null });
      expect(actividad.rolDe(ORGANIZADORA, true)).toBe('participante');
    });
  });

  describe('FP paso 4 y RN2: opciones según rol y estado', () => {
    const casos: [EstadoActividad, 'organizador' | 'participante' | 'ninguno', OpcionDeActividad[]][] = [
      ['programada', 'ninguno', ['verParticipantes', 'verMapa', 'unirse', 'compartir']],
      [
        'programada',
        'participante',
        [
          'verParticipantes',
          'verMapa',
          'abandonar',
          'verChat',
          'invitarAmigos',
          'modificarParticipacion',
          'silenciar',
          'compartir',
        ],
      ],
      [
        'programada',
        'organizador',
        [
          'verParticipantes',
          'verMapa',
          'verChat',
          'invitarAmigos',
          'modificarParticipacion',
          'silenciar',
          'compartir',
          'editar',
          'removerParticipantes',
          'cancelar',
        ],
      ],
      ['iniciada', 'ninguno', ['verParticipantes', 'verMapa', 'compartir']],
      ['iniciada', 'participante', ['verParticipantes', 'verMapa', 'verChat', 'verGastos', 'silenciar', 'valorar', 'compartir']],
      [
        'iniciada',
        'organizador',
        ['verParticipantes', 'verMapa', 'verChat', 'verGastos', 'silenciar', 'valorar', 'compartir', 'archivar'],
      ],
      // RN5: archivada en solo lectura, solo admite valoraciones
      ['archivada', 'participante', ['verParticipantes', 'verMapa', 'verChat', 'verGastos', 'valorar']],
      ['archivada', 'organizador', ['verParticipantes', 'verMapa', 'verChat', 'verGastos', 'valorar']],
      ['archivada', 'ninguno', ['verParticipantes', 'verMapa']],
      // E1 / RN3: cancelada, solo consulta
      ['cancelada', 'ninguno', ['verParticipantes', 'verMapa']],
      ['cancelada', 'participante', ['verParticipantes', 'verMapa']],
      ['cancelada', 'organizador', ['verParticipantes', 'verMapa']],
    ];

    it.each(casos)('%s como %s', (estado, rol, opcionesEsperadas) => {
      expect(actividadEn(estado).opcionesPara(rol)).toEqual(opcionesEsperadas);
    });
  });

  describe('RN3: incorporaciones', () => {
    it('E1: una actividad cancelada no admite incorporaciones ni ofrece unirse', () => {
      const actividad = actividadEn('cancelada');
      expect(actividad.admiteIncorporaciones()).toBe(false);
      expect(actividad.opcionesPara('ninguno')).not.toContain('unirse');
    });

    it('una actividad programada completa no ofrece unirse', () => {
      const actividad = actividadEn('programada', { cupoMaximo: 2, cuposOcupados: 2 });
      expect(actividad.estaCompleta()).toBe(true);
      expect(actividad.opcionesPara('ninguno')).not.toContain('unirse');
    });

    it('los cupos libres nunca son negativos', () => {
      expect(actividadEn('programada', { cupoMaximo: 2, cuposOcupados: 3 }).cuposLibres()).toBe(0);
    });

    it('"completa" solo aplica a una actividad programada', () => {
      expect(actividadEn('iniciada', { cupoMaximo: 2, cuposOcupados: 2 }).estaCompleta()).toBe(false);
    });
  });

  describe('RN4: fecha límite para registrar gastos y pagos', () => {
    it('en estado iniciada es la fecha de inicio más 14 días', () => {
      expect(actividadEn('iniciada').fechaLimiteGastos()).toEqual(new Date('2026-11-21T10:30:00.000Z'));
    });

    it.each<EstadoActividad>(['programada', 'archivada', 'cancelada'])('en estado %s no se indica', (estado) => {
      expect(actividadEn(estado).fechaLimiteGastos()).toBeNull();
    });
  });
});

describe('Conversión de montos a centésimos', () => {
  it.each([
    ['1200.00', 120000],
    ['450.50', 45050],
    ['0.05', 5],
    ['7', 700],
  ])('%s → %i', (monto, centesimos) => {
    expect(aCentesimos(monto)).toBe(centesimos);
  });
});
