import { GoogleGeocoding } from '../src/infra/google-geocoding';

const punto = { lat: -34.91635775362398, lng: -56.11543161770436 };
const direccion = {
  formatted_address: 'Referencia de la costa, Montevideo, Uruguay',
  geometry: { location: { lat: -34.9, lng: -56.2 } },
  address_components: [
    { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
    { long_name: 'Departamento de Montevideo', short_name: 'Montevideo', types: ['administrative_area_level_1'] },
  ],
};
function proveedor(cuerpo: unknown, estado = 200) {
  const pedir = jest.fn().mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: estado }));
  return { puntos: new GoogleGeocoding('clave-prueba', 1000, pedir), pedir };
}

describe('CU10 geocodificación del pin', () => {
  it('FP: conserva las coordenadas del pin, aunque la dirección cercana tenga otras', async () => {
    const { puntos, pedir } = proveedor({ status: 'OK', results: [direccion] });
    expect(await puntos.resolver(punto)).toEqual({
      ...punto,
      direccion: direccion.formatted_address,
      departamento: 'Montevideo',
    });
    expect(new URL(pedir.mock.calls[0][0]).searchParams.get('latlng')).toBe(`${punto.lat},${punto.lng}`);
  });
  it('E4: rechaza coordenadas cuyo país identificado no es Uruguay', async () => {
    const lugar = { ...direccion, address_components: [{ long_name: 'Argentina', short_name: 'AR', types: ['country'] }] };
    await expect(proveedor({ status: 'OK', results: [lugar] }).puntos.resolver(punto)).rejects.toMatchObject({ estado: 400 });
  });
  it('E4: exige un departamento identificable', async () => {
    const lugar = { ...direccion, address_components: direccion.address_components.slice(0, 1) };
    await expect(proveedor({ status: 'OK', results: [lugar] }).puntos.resolver(punto)).rejects.toMatchObject({ estado: 400 });
  });
  it('E4: un punto sin resultados no habilita un destino provisional', async () => {
    await expect(proveedor({ status: 'ZERO_RESULTS', results: [] }).puntos.resolver(punto)).rejects.toMatchObject({
      estado: 400,
    });
  });
  it.each([
    { status: 'REQUEST_DENIED', results: [] },
    { status: 'OVER_QUERY_LIMIT', results: [] },
    { status: 'OK', results: [] },
    { status: 'OK', results: [{ geometry: {} }] },
  ])('ER2: informa indisponibilidad sin inventar una ubicación (%j)', async (respuesta) => {
    await expect(proveedor(respuesta).puntos.resolver(punto)).rejects.toMatchObject({
      estado: 503,
      codigo: 'PUNTOS_NO_DISPONIBLES',
    });
  });
  it('ER2: maneja fallas de red y HTTP del proveedor', async () => {
    await expect(
      new GoogleGeocoding('clave', 1000, jest.fn().mockRejectedValue(new Error('timeout'))).resolver(punto),
    ).rejects.toMatchObject({ estado: 503 });
    await expect(proveedor({}, 503).puntos.resolver(punto)).rejects.toMatchObject({ estado: 503 });
  });
  it('ER2: sin clave no intenta consultar Google', async () => {
    const pedir = jest.fn();
    await expect(new GoogleGeocoding('', 1000, pedir).resolver(punto)).rejects.toMatchObject({ estado: 503 });
    expect(pedir).not.toHaveBeenCalled();
  });
});
