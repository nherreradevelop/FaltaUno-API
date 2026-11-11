import { ActividadesRepositorio } from '../src/modulos/actividades/actividades.repositorio';
import { ActividadesServicio, type DependenciasActividades } from '../src/modulos/actividades/actividades.servicio';
import { aActividadCreada } from '../src/modulos/actividades/actividades.dto';
import {
  AHORA_ACTIVIDAD,
  datosActividad,
  DESTINO_PROVISIONAL_PRUEBA,
  LUGAR_ACTIVIDAD,
  USUARIO_ACTIVIDAD,
} from './actividades.fixtures';
import { DESTINO_PROVISIONAL_ID } from '../src/modulos/actividades/destino-provisional';

function preparar() {
  const repo = new ActividadesRepositorio({ query: jest.fn() });
  jest.spyOn(repo, 'cuentaActiva').mockResolvedValue(true);
  jest.spyOn(repo, 'deportesActivos').mockResolvedValue([{ id: 1, nombre: 'Surf' }]);
  jest.spyOn(repo, 'buscarCreada').mockResolvedValue(null);
  jest.spyOn(repo, 'bloquearAlta').mockResolvedValue();
  jest.spyOn(repo, 'crear').mockResolvedValue();
  const dependencias: DependenciasActividades = {
    repositorio: repo,
    transaccion: async (operacion) => operacion(repo),
    mapas: {
      buscar: jest.fn().mockResolvedValue([]),
      resolver: jest.fn().mockResolvedValue(LUGAR_ACTIVIDAD),
      disponible: jest.fn().mockReturnValue(true),
    },
    puntos: { resolver: jest.fn().mockImplementation(async (punto) => ({ ...LUGAR_ACTIVIDAD, ...punto })) },
    idempotencia: { reservar: jest.fn().mockResolvedValue('actividad-1') },
    sesiones: { buscarUsuarioId: jest.fn().mockResolvedValue(USUARIO_ACTIVIDAD) },
    maximoParticipantes: 20,
    destinoProvisional: DESTINO_PROVISIONAL_PRUEBA,
    ahora: () => AHORA_ACTIVIDAD,
  };
  return { repo, dependencias, servicio: new ActividadesServicio(dependencias) };
}
describe('CU10 servicio', () => {
  it('FP: guarda actividad con ubicación validada y costo total, y calcula la parte orientativa', async () => {
    const { servicio, repo } = preparar();
    const resultado = await servicio.crear(USUARIO_ACTIVIDAD, 'clave-intento', datosActividad(), 'token');
    expect(resultado).toMatchObject({
      estado: 'programada',
      cantidadParticipantes: 2,
      costoEstimadoCentavos: 120050,
      costoPorPersonaCentavos: 60025,
    });
    expect(repo.crear).toHaveBeenCalledWith(
      'actividad-1',
      USUARIO_ACTIVIDAD,
      datosActividad(),
      LUGAR_ACTIVIDAD,
      LUGAR_ACTIVIDAD,
      false,
    );
  });
  it('FP: admite origen omitido y no consulta Google para inventar un origen', async () => {
    const { servicio, repo, dependencias } = preparar();
    const datos = datosActividad({ origenPlaceId: null, tieneVehiculo: false, lugaresVehiculo: null });
    await servicio.crear(USUARIO_ACTIVIDAD, 'sin-origen', datos, 'token');
    expect(dependencias.mapas.resolver).toHaveBeenCalledTimes(1);
    expect(repo.crear).toHaveBeenCalledWith('actividad-1', USUARIO_ACTIVIDAD, datos, null, LUGAR_ACTIVIDAD, false);
  });
  it('E4: sin Maps permite el destino provisional canónico y guarda su marca', async () => {
    const { servicio, repo, dependencias } = preparar();
    jest.mocked(dependencias.mapas.disponible).mockReturnValue(false);
    const datos = datosActividad({
      origenPlaceId: null,
      destinoPlaceId: DESTINO_PROVISIONAL_ID,
      tieneVehiculo: false,
      lugaresVehiculo: null,
    });
    expect(await servicio.crear(USUARIO_ACTIVIDAD, 'provisional', datos, 'token')).toMatchObject({ destinoProvisional: true });
    expect(dependencias.mapas.resolver).not.toHaveBeenCalled();
    expect(repo.crear).toHaveBeenCalledWith('actividad-1', USUARIO_ACTIVIDAD, datos, null, DESTINO_PROVISIONAL_PRUEBA, true);
    expect(await servicio.opciones(USUARIO_ACTIVIDAD)).toMatchObject({
      mapasDisponibles: false,
      destinoPorDefecto: {
        placeId: DESTINO_PROVISIONAL_ID,
        descripcion: DESTINO_PROVISIONAL_PRUEBA.direccion,
        lat: DESTINO_PROVISIONAL_PRUEBA.lat,
        lng: DESTINO_PROVISIONAL_PRUEBA.lng,
        provisional: true,
      },
    });
  });
  it('E4: con Maps disponible rechaza el destino provisional sin escrituras', async () => {
    const { servicio, repo } = preparar();
    await expect(
      servicio.crear(USUARIO_ACTIVIDAD, 'provisional', datosActividad({ destinoPlaceId: DESTINO_PROVISIONAL_ID }), 'token'),
    ).rejects.toMatchObject({ estado: 400, campos: { destinoPlaceId: expect.any(String) } });
    expect(repo.crear).not.toHaveBeenCalled();
  });
  it('E4: vehículo sin origen devuelve el error del campo antes de consultar Maps o persistir', async () => {
    const { servicio, repo, dependencias } = preparar();
    await expect(
      servicio.crear(USUARIO_ACTIVIDAD, 'vehiculo-sin-origen', datosActividad({ origenPlaceId: null }), 'token'),
    ).rejects.toMatchObject({ estado: 400, campos: { origenPlaceId: expect.any(String) } });
    expect(dependencias.mapas.resolver).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
    expect(repo.bloquearAlta).not.toHaveBeenCalled();
  });
  it('E4: el valor provisional no se acepta como origen', async () => {
    const { servicio, repo } = preparar();
    await expect(
      servicio.crear(USUARIO_ACTIVIDAD, 'origen-provisional', datosActividad({ origenPlaceId: DESTINO_PROVISIONAL_ID }), 'token'),
    ).rejects.toMatchObject({ estado: 400, campos: { origenPlaceId: expect.any(String) } });
    expect(repo.crear).not.toHaveBeenCalled();
  });
  it('FP/E5: devuelve opciones reales y el placeholder acordado de CU15', async () => {
    const { servicio } = preparar();
    expect(await servicio.opciones(USUARIO_ACTIVIDAD)).toMatchObject({
      maximoParticipantes: 20,
      pronostico: { disponible: false },
    });
    expect(await servicio.buscarUbicaciones(USUARIO_ACTIVIDAD, 'Montevideo', 'sesion')).toEqual([]);
  });
  it('FP: resuelve origen y destino por pin sin convertirlos en un place ID ni marcar destino provisional', async () => {
    const { servicio, repo, dependencias } = preparar();
    const origen = { lat: -34.9055, lng: -56.1913 };
    const destino = { lat: -34.91635775362398, lng: -56.11543161770436 };
    const datos = datosActividad({
      origenPlaceId: null,
      destinoPlaceId: null,
      origenCoordenadas: origen,
      destinoCoordenadas: destino,
    });
    expect(await servicio.crear(USUARIO_ACTIVIDAD, 'pins', datos, 'token')).toMatchObject({ destinoProvisional: false });
    expect(dependencias.mapas.resolver).not.toHaveBeenCalled();
    expect(dependencias.puntos.resolver).toHaveBeenCalledWith(origen);
    expect(dependencias.puntos.resolver).toHaveBeenCalledWith(destino);
    expect(repo.crear).toHaveBeenCalledWith(
      'actividad-1',
      USUARIO_ACTIVIDAD,
      datos,
      { ...LUGAR_ACTIVIDAD, ...origen },
      { ...LUGAR_ACTIVIDAD, ...destino },
      false,
    );
  });
  it('E4: el rechazo del proveedor del pin impide persistir el alta', async () => {
    const { servicio, repo, dependencias } = preparar();
    jest.mocked(dependencias.puntos.resolver).mockRejectedValue(new Error('Punto fuera de Uruguay'));
    const datos = datosActividad({
      tieneVehiculo: false,
      lugaresVehiculo: null,
      origenPlaceId: null,
      destinoPlaceId: null,
      destinoCoordenadas: { lat: -34.9, lng: -56.2 },
    });
    await expect(servicio.crear(USUARIO_ACTIVIDAD, 'pin-invalido', datos, 'token')).rejects.toThrow('Punto fuera de Uruguay');
    expect(repo.crear).not.toHaveBeenCalled();
  });
  it('RNF-10: recupera un alta ya confirmada sin repetir Google ni validar nuevamente la fecha', async () => {
    const { servicio, repo, dependencias } = preparar();
    const respuesta = aActividadCreada('actividad-1', datosActividad());
    jest.mocked(repo.buscarCreada).mockResolvedValue(respuesta);
    expect(
      await servicio.crear(USUARIO_ACTIVIDAD, 'clave', datosActividad({ fechaHoraInicio: '2020-01-01T00:00:00Z' }), 'token'),
    ).toEqual(respuesta);
    expect(dependencias.mapas.resolver).not.toHaveBeenCalled();
  });
  it('RNF-10: el segundo envío concurrente encuentra el resultado después del bloqueo', async () => {
    const { servicio, repo } = preparar();
    const respuesta = aActividadCreada('actividad-1', datosActividad());
    jest.mocked(repo.buscarCreada).mockResolvedValueOnce(null).mockResolvedValueOnce(respuesta);
    expect(await servicio.crear(USUARIO_ACTIVIDAD, 'clave', datosActividad(), 'token')).toEqual(respuesta);
    expect(repo.crear).not.toHaveBeenCalled();
  });
  it('E1: rechaza un deporte inactivo sin escritura', async () => {
    const { servicio, repo } = preparar();
    jest.mocked(repo.deportesActivos).mockResolvedValue([]);
    await expect(servicio.crear(USUARIO_ACTIVIDAD, 'clave', datosActividad(), 'token')).rejects.toMatchObject({ estado: 400 });
    expect(repo.crear).not.toHaveBeenCalled();
  });
  it.each(['inicio', 'trasMapas', 'alGuardar', 'cuenta'])('ER3: rechaza sesión/cuenta inválida en %s', async (momento) => {
    const { servicio, repo, dependencias } = preparar();
    if (momento === 'inicio') jest.mocked(dependencias.sesiones.buscarUsuarioId).mockResolvedValue(null);
    if (momento === 'trasMapas')
      jest.mocked(dependencias.sesiones.buscarUsuarioId).mockResolvedValueOnce(USUARIO_ACTIVIDAD).mockResolvedValue(null);
    if (momento === 'alGuardar') jest.mocked(repo.cuentaActiva).mockResolvedValueOnce(true).mockResolvedValue(false);
    if (momento === 'cuenta') jest.mocked(repo.cuentaActiva).mockResolvedValue(false);
    await expect(servicio.crear(USUARIO_ACTIVIDAD, 'clave', datosActividad(), 'token')).rejects.toMatchObject({ estado: 401 });
    expect(repo.crear).not.toHaveBeenCalled();
  });
  it('RN10: admite costo omitido y no genera gastos ni balances', async () => {
    const { servicio } = preparar();
    expect(
      await servicio.crear(USUARIO_ACTIVIDAD, 'clave', datosActividad({ costoEstimadoCentavos: null }), 'token'),
    ).toMatchObject({ costoEstimadoCentavos: null, costoPorPersonaCentavos: null });
  });
  it('ER1/ER2: propaga el fallo de persistencia sin informar éxito', async () => {
    const { servicio, repo } = preparar();
    jest.mocked(repo.crear).mockRejectedValue(new Error('Fallo SQL'));
    await expect(servicio.crear(USUARIO_ACTIVIDAD, 'clave', datosActividad(), 'token')).rejects.toThrow('Fallo SQL');
  });
});
