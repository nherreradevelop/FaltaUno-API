import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { leerConfig } from '../src/config/env';

const entornoValido = parseEnv(readFileSync(path.resolve(__dirname, '../.env.example'), 'utf8'));
const variablesDestino = [
  'ACTIVIDAD_DESTINO_PROVISIONAL_LAT',
  'ACTIVIDAD_DESTINO_PROVISIONAL_LNG',
  'ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO',
];

describe('CU10 configuración del destino provisional', () => {
  it('convierte las coordenadas configuradas y normaliza el departamento sin usar la ubicación de ejemplo', () => {
    expect(
      leerConfig({
        ...entornoValido,
        ACTIVIDAD_DESTINO_PROVISIONAL_LAT: ' -34.47391234567891 ',
        ACTIVIDAD_DESTINO_PROVISIONAL_LNG: ' -57.84331234567891 ',
        ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO: ' Colonia ',
      }),
    ).toMatchObject({
      ACTIVIDAD_DESTINO_PROVISIONAL_LAT: -34.47391234567891,
      ACTIVIDAD_DESTINO_PROVISIONAL_LNG: -57.84331234567891,
      ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO: 'Colonia',
    });
  });

  it.each(variablesDestino)('rechaza %s ausente o vacía para no guardar una ubicación implícita', (variable) => {
    for (const valor of [undefined, '', '   ']) {
      expect(() => leerConfig({ ...entornoValido, [variable]: valor })).toThrow(variable);
    }
  });

  it.each([
    ['ACTIVIDAD_DESTINO_PROVISIONAL_LAT', '-90.1'],
    ['ACTIVIDAD_DESTINO_PROVISIONAL_LAT', '90.1'],
    ['ACTIVIDAD_DESTINO_PROVISIONAL_LNG', '-180.1'],
    ['ACTIVIDAD_DESTINO_PROVISIONAL_LNG', '180.1'],
    ['ACTIVIDAD_DESTINO_PROVISIONAL_LAT', 'no-es-un-numero'],
    ['ACTIVIDAD_DESTINO_PROVISIONAL_LNG', 'Infinity'],
    ['ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO', 'a'.repeat(31)],
  ])('rechaza %s inválida: %s', (variable, valor) => {
    expect(() => leerConfig({ ...entornoValido, [variable]: valor })).toThrow(variable);
  });
});
