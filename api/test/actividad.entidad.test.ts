import { Actividad } from '../src/modulos/actividades/actividad.entidad';
import { esquemaCrearActividad } from '../src/modulos/actividades/actividades.dto';
import { AHORA_ACTIVIDAD, datosActividad } from './actividades.fixtures';

describe('CU10 reglas de datos y dominio', () => {
  it('FP: admite organizador e invitados hasta el cupo y una fecha futura', () => {
    expect(() => new Actividad(datosActividad({ cupoMaximo: 2 })).validarCreacion(20, AHORA_ACTIVIDAD)).not.toThrow();
  });
  it.each(['2026-11-07T12:00:00Z', '2026-11-06T12:00:00Z'])('E2: rechaza fecha igual o anterior (%s)', (fechaHoraInicio) => {
    expect(() => new Actividad(datosActividad({ fechaHoraInicio })).validarCreacion(20, AHORA_ACTIVIDAD)).toThrow();
  });
  it('E3: respeta el máximo configurable y cuenta al organizador', () => {
    expect(() => new Actividad(datosActividad({ cupoMaximo: 21 })).validarCreacion(20, AHORA_ACTIVIDAD)).toThrow();
    expect(() =>
      new Actividad(datosActividad({ cupoMaximo: 2, invitados: ['Ana', 'Luis'] })).validarCreacion(20, AHORA_ACTIVIDAD),
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
    expect(() => new Actividad(esquemaCrearActividad.parse(sinOrigen)).validarCreacion(20, AHORA_ACTIVIDAD)).not.toThrow();
  });
  it('E4: exige origen cuando el organizador tiene vehículo propio', () => {
    expect(() => new Actividad(datosActividad({ origenPlaceId: null })).validarCreacion(20, AHORA_ACTIVIDAD)).toThrow(
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
    expect(() => new Actividad(datos).validarCreacion(20, AHORA_ACTIVIDAD)).not.toThrow();
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
