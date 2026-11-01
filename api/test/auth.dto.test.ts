import { validar } from '../src/comun/validacion';
import { esquemaLogin } from '../src/modulos/auth/auth.dto';

describe('CU01 FP paso 5 – Formato de los datos ingresados', () => {
  it('acepta un correo y una contraseña, y quita espacios del correo', () => {
    expect(validar(esquemaLogin, { email: '  ana@faltauno.uy ', password: 'x' })).toEqual({
      email: 'ana@faltauno.uy',
      password: 'x',
    });
  });

  it('rechaza un correo mal formado y una contraseña vacía con un mensaje por campo', () => {
    expect(() => validar(esquemaLogin, { email: 'ana', password: '' })).toThrow(
      expect.objectContaining({
        estado: 400,
        codigo: 'DATOS_INVALIDOS',
        campos: { email: 'Ingresá un correo electrónico válido.', password: 'Ingresá tu contraseña.' },
      }),
    );
  });

  it('rechaza un cuerpo sin campos', () => {
    expect(() => validar(esquemaLogin, {})).toThrow(
      expect.objectContaining({ campos: { email: 'Ingresá tu correo electrónico.', password: 'Ingresá tu contraseña.' } }),
    );
  });
});
