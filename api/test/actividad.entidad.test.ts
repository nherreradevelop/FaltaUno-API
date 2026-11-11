import {
  Actividad,
  NuevaActividad,
  type EstadoActividad,
  type OpcionDeActividad,
} from '../src/modulos/actividades/actividad.entidad';
import { esquemaCrearActividad } from '../src/modulos/actividades/actividades.dto';
import { aCentesimos } from '../src/modulos/actividades/actividades.repositorio';
import { AHORA_ACTIVIDAD, datosActividad } from './actividades.fixtures';
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

describe('CU10 reglas de datos y dominio', () => {
  it('FP: admite organizador e invitados hasta el cupo y una fecha futura', () => {
    expect(() => new NuevaActividad(datosActividad({ cupoMaximo: 2 })).validarCreacion(20, AHORA_ACTIVIDAD)).not.toThrow();
  });
  it.each(['2026-11-07T12:00:00Z', '2026-11-06T12:00:00Z'])('E2: rechaza fecha igual o anterior (%s)', (fechaHoraInicio) => {
    expect(() => new NuevaActividad(datosActividad({ fechaHoraInicio })).validarCreacion(20, AHORA_ACTIVIDAD)).toThrow();
  });
  it('E3: respeta el máximo configurable y cuenta al organizador', () => {
    expect(() => new NuevaActividad(datosActividad({ cupoMaximo: 21 })).validarCreacion(20, AHORA_ACTIVIDAD)).toThrow();
    expect(() =>
      new NuevaActividad(datosActividad({ cupoMaximo: 2, invitados: ['Ana', 'Luis'] })).validarCreacion(20, AHORA_ACTIVIDAD),
    ).toThrow();
  });
  it.each([
    { descripcion: '' },
    { nombre: ' ' },
    { cupoMaximo: 1 },
    { nivel: 'experto' },
    { fechaHoraInicio: '2026-11-20T10:00:00' },
    { origenPlaceId: '' },
  ])('E1/E3/E4/RN7: rechaza datos inválidos %j', (cambios) => {
    expect(esquemaCrearActividad.safeParse({ ...datosActividad(), ...cambios }).success).toBe(false);
  });
  it('E1: solo exige lugares al tener vehículo propio', () => {
    expect(esquemaCrearActividad.safeParse({ ...datosActividad(), lugaresVehiculo: null }).success).toBe(false);
    expect(esquemaCrearActividad.safeParse({ ...datosActividad(), tieneVehiculo: false }).success).toBe(false);
    expect(datosActividad({ tieneVehiculo: false, lugaresVehiculo: null })).toMatchObject({ lugaresVehiculo: null });
  });
  it('FP: sin vehículo el origen es opcional y se normaliza a null si se omite', () => {
    const { origenPlaceId: _origen, ...sinOrigen } = datosActividad({ tieneVehiculo: false, lugaresVehiculo: null });
    expect(esquemaCrearActividad.parse(sinOrigen).origenPlaceId).toBeNull();
    expect(() => new NuevaActividad(esquemaCrearActividad.parse(sinOrigen)).validarCreacion(20, AHORA_ACTIVIDAD)).not.toThrow();
  });
  it('E4: exige origen cuando el organizador tiene vehículo propio', () => {
    expect(() => new NuevaActividad(datosActividad({ origenPlaceId: null })).validarCreacion(20, AHORA_ACTIVIDAD)).toThrow(
      expect.objectContaining({ campos: { origenPlaceId: expect.any(String) } }),
    );
  });
  it('RNF-24: rechaza atributos de identidad o estado inyectados por el cliente', () => {
    expect(esquemaCrearActividad.safeParse({ ...datosActividad(), organizadorId: 'otro', estado: 'archivada' }).success).toBe(
      false,
    );
  });
  it('FP: un conductor puede indicar el origen con un pin', () => {
    const datos = datosActividad({ origenPlaceId: null, origenCoordenadas: { lat: -34.9, lng: -56.2 } });
    expect(() => new NuevaActividad(datos).validarCreacion(20, AHORA_ACTIVIDAD)).not.toThrow();
  });
  it.each([
    { destinoPlaceId: null },
    { destinoCoordenadas: { lat: -34.9, lng: -56.2 } },
    { origenCoordenadas: { lat: -34.9, lng: -56.2 } },
    { destinoPlaceId: null, destinoCoordenadas: { lat: 91, lng: -56.2 } },
    { destinoPlaceId: null, destinoCoordenadas: { lat: -34.9, lng: -181 } },
    { destinoPlaceId: null, destinoCoordenadas: { lat: -34.9, lng: -56.2, departamento: 'inventado' } },
  ])('E4: rechaza destino ausente, selecciones ambiguas o coordenadas inválidas: %j', (cambios) => {
    expect(esquemaCrearActividad.safeParse({ ...datosActividad(), ...cambios }).success).toBe(false);
  });
});
