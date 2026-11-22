import { esquemaValoracion, MENSAJE_PUNTAJE_INVALIDO } from '../src/modulos/valoraciones/valoraciones.dto';

function primerError(datos: unknown): string | undefined {
  const resultado = esquemaValoracion.safeParse(datos);
  return resultado.success ? undefined : resultado.error.issues[0]?.message;
}

describe('CU21 – datos de la valoración', () => {
  it.each([[{}], [{ puntaje: null }], [{ puntaje: 0 }], [{ puntaje: 6 }], [{ puntaje: 3.5 }], [{ puntaje: '4' }]])(
    'E1: rechaza un puntaje faltante o fuera de 1 a 5: %j',
    (datos) => {
      expect(primerError(datos)).toBe(MENSAJE_PUNTAJE_INVALIDO);
    },
  );

  it('RN6: el comentario es opcional y uno vacío se guarda como null', () => {
    expect(esquemaValoracion.parse({ puntaje: 1 })).toEqual({ puntaje: 1, comentario: null });
    expect(esquemaValoracion.parse({ puntaje: 5, comentario: '   ' })).toEqual({ puntaje: 5, comentario: null });
    expect(esquemaValoracion.parse({ puntaje: 5, comentario: null })).toEqual({ puntaje: 5, comentario: null });
  });

  it('RN6: el comentario se guarda sin espacios sobrantes y con hasta 500 caracteres', () => {
    expect(esquemaValoracion.parse({ puntaje: 4, comentario: '  Muy puntual.  ' })).toEqual({
      puntaje: 4,
      comentario: 'Muy puntual.',
    });
    expect(primerError({ puntaje: 4, comentario: 'a'.repeat(501) })).toBe('El comentario puede tener hasta 500 caracteres.');
  });
});
