import { esquemaIdNotificacion, esquemaListar, esquemaMarcarTodas } from '../src/modulos/notificaciones/notificaciones.dto';

describe('CU40 – validación de entrada de notificaciones', () => {
  it('acepta un id de MongoDB y rechaza cualquier otro valor', () => {
    expect(esquemaIdNotificacion.safeParse({ id: '6740d4f2a1b2c3d4e5f60718' }).success).toBe(true);
    for (const id of ['abc', '6740d4f2a1b2c3d4e5f6071', '6740d4f2a1b2c3d4e5f6071z', "' OR 1=1"]) {
      expect(esquemaIdNotificacion.safeParse({ id }).success).toBe(false);
    }
  });

  it('A2: "antesDe" es opcional y, si viene, tiene que ser un id válido', () => {
    expect(esquemaListar.safeParse({}).success).toBe(true);
    expect(esquemaListar.safeParse({ antesDe: '6740d4f2a1b2c3d4e5f60718' }).success).toBe(true);
    expect(esquemaListar.safeParse({ antesDe: 'pagina-2' }).success).toBe(false);
  });

  it('A1: "hasta" tiene que ser una fecha ISO 8601', () => {
    expect(esquemaMarcarTodas.safeParse({ hasta: '2026-11-19T20:40:00.000Z' }).success).toBe(true);
    expect(esquemaMarcarTodas.safeParse({ hasta: '19/11/2026' }).success).toBe(false);
    expect(esquemaMarcarTodas.safeParse({}).success).toBe(false);
  });
});
