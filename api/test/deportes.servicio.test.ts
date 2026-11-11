import { DeportesServicio } from '../src/modulos/deportes/deportes.servicio';
import { crearDeporte } from './dobles';

describe('CU08 A1 / ER2 – Opciones del filtro de deportes', () => {
  it('lista los deportes activos del catálogo', async () => {
    const servicio = new DeportesServicio({ listarActivos: async () => [crearDeporte(3, 'Ciclismo'), crearDeporte(1, 'Surf')] });
    await expect(servicio.listarActivos()).resolves.toEqual([
      { id: 3, nombre: 'Ciclismo' },
      { id: 1, nombre: 'Surf' },
    ]);
  });
});
