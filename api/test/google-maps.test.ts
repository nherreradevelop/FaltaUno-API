import { GoogleMaps } from '../src/infra/google-maps';

function proveedor(cuerpo: unknown, estado = 200) {
  const pedir = jest.fn().mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: estado }));
  return { mapas: new GoogleMaps('clave-prueba', 1000, pedir), pedir };
}
const lugar = {
  formattedAddress: 'Plaza Independencia, Montevideo, Uruguay',
  location: { latitude: -34.906, longitude: -56.2 },
  addressComponents: [
    { longText: 'Uruguay', shortText: 'UY', types: ['country'] },
    { longText: 'Departamento de Montevideo', types: ['administrative_area_level_1'] },
  ],
};
describe('CU10 Google Maps', () => {
  it('ER2: trata datos incompletos del proveedor como indisponibilidad', async () => {
    await expect(proveedor({ location: { latitude: 0, longitude: 0 } }).mapas.resolver('id')).rejects.toMatchObject({
      estado: 503,
    });
    await expect(proveedor({ suggestions: 'formato incorrecto' }).mapas.buscar('Mon', 'sesion')).rejects.toMatchObject({
      estado: 503,
    });
  });
  it('E4: busca únicamente predicciones de Uruguay', async () => {
    const { mapas, pedir } = proveedor({
      suggestions: [{ placePrediction: { placeId: 'id', text: { text: 'Montevideo' } } }, { queryPrediction: {} }],
    });
    expect(await mapas.buscar('Mont', 'sesion')).toEqual([{ placeId: 'id', descripcion: 'Montevideo' }]);
    expect(JSON.parse(pedir.mock.calls[0][1].body)).toMatchObject({ includedRegionCodes: ['uy'], input: 'Mont' });
  });
  it('FP: obtiene coordenadas y departamento desde el proveedor', async () => {
    expect(await proveedor(lugar).mapas.resolver('id')).toEqual({
      direccion: lugar.formattedAddress,
      lat: -34.906,
      lng: -56.2,
      departamento: 'Montevideo',
    });
  });
  it('E4: rechaza lugares fuera de Uruguay', async () => {
    await expect(
      proveedor({ ...lugar, addressComponents: [{ longText: 'Argentina', shortText: 'AR', types: ['country'] }] }).mapas.resolver(
        'id',
      ),
    ).rejects.toMatchObject({ estado: 400 });
  });
  it('ER2: informa ausencia de configuración sin realizar llamadas', async () => {
    expect(new GoogleMaps('', 1000).disponible()).toBe(false);
    await expect(new GoogleMaps('', 1000).buscar('Mont', 'sesion')).rejects.toMatchObject({ codigo: 'MAPAS_NO_CONFIGURADOS' });
  });
  it('E4/ER2: registra la caída y vuelve a estar disponible tras una consulta exitosa', async () => {
    const pedir = jest
      .fn()
      .mockRejectedValueOnce(new Error('sin conexión'))
      .mockResolvedValue(new Response(JSON.stringify({ suggestions: [] }), { status: 200 }));
    const mapas = new GoogleMaps('clave', 1000, pedir);
    expect(mapas.disponible()).toBe(true);
    await expect(mapas.buscar('Mont', 'sesion')).rejects.toMatchObject({ estado: 503 });
    expect(mapas.disponible()).toBe(false);
    await mapas.buscar('Mont', 'sesion');
    expect(mapas.disponible()).toBe(true);
  });
  it.each([400, 404, 429, 500])('E4/ER2: maneja respuesta %i', async (estado) => {
    await expect(proveedor({}, estado).mapas.resolver('id')).rejects.toMatchObject({ estado: estado < 429 ? 400 : 503 });
  });
  it('ER2: maneja caída de red y timeout', async () => {
    await expect(
      new GoogleMaps('clave', 1000, jest.fn().mockRejectedValue(new Error('timeout'))).resolver('id'),
    ).rejects.toMatchObject({ estado: 503 });
  });
});
