import { AppError } from '../src/comun/errores';
import { AuthServicio } from '../src/modulos/auth/auth.servicio';
import {
  BloqueosEnMemoria,
  crearUsuarioGuardado,
  loggerSilencioso,
  MAXIMO_INTENTOS,
  MINUTOS_DE_BLOQUEO,
  PASSWORD_CORRECTA,
  SesionesEnMemoria,
  UsuariosEnMemoria,
  VerificadorGoogleFalso,
  type UsuarioGuardado,
} from './dobles';

const IDENTIDAD_GOOGLE = { proveedorId: 'google-sub-123', email: 'ana@faltauno.uy' };

function armarServicio(
  guardados: UsuarioGuardado[],
  google: VerificadorGoogleFalso = new VerificadorGoogleFalso(IDENTIDAD_GOOGLE),
) {
  const usuarios = new UsuariosEnMemoria(guardados);
  const sesiones = new SesionesEnMemoria();
  const servicio = new AuthServicio({
    usuarios,
    sesiones,
    bloqueos: new BloqueosEnMemoria(),
    verificadorGoogle: google,
    logger: loggerSilencioso,
    maximoIntentos: MAXIMO_INTENTOS,
    minutosDeBloqueo: MINUTOS_DE_BLOQUEO,
  });
  return { servicio, usuarios, sesiones };
}

/** Ejecuta la promesa y devuelve el AppError que lanzó, para verificar estado y código. */
async function capturarError(promesa: Promise<unknown>): Promise<AppError> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Se esperaba un AppError y la operación terminó bien');
}

describe('CU01 – Inicio de sesión con correo y contraseña', () => {
  it('FP: con credenciales correctas devuelve un token y los datos públicos del usuario', async () => {
    const { servicio, sesiones } = armarServicio([crearUsuarioGuardado()]);

    const respuesta = await servicio.iniciarSesion({ email: 'ana@faltauno.uy', password: PASSWORD_CORRECTA });

    expect(respuesta.token).toBeTruthy();
    expect(sesiones.abiertas.get(respuesta.token)).toBe('usuario-1');
    expect(respuesta.usuario).toEqual({ id: 'usuario-1', nombre: 'Ana Pérez', email: 'ana@faltauno.uy', fotoUrl: null });
    expect(respuesta.usuario).not.toHaveProperty('passwordHash');
  });

  it('FP: el correo se compara sin distinguir mayúsculas', async () => {
    const { servicio } = armarServicio([crearUsuarioGuardado()]);
    await expect(servicio.iniciarSesion({ email: 'ANA@FaltaUno.uy', password: PASSWORD_CORRECTA })).resolves.toBeDefined();
  });

  it('FP / RN3: un ingreso correcto reinicia los intentos fallidos consecutivos', async () => {
    const guardado = crearUsuarioGuardado({ intentosFallidos: 3 });
    const { servicio } = armarServicio([guardado]);

    await servicio.iniciarSesion({ email: guardado.email, password: PASSWORD_CORRECTA });

    expect(guardado.intentosFallidos).toBe(0);
  });

  it('E3: contraseña incorrecta → 401 sin revelar cuál dato falló', async () => {
    const { servicio } = armarServicio([crearUsuarioGuardado()]);

    const error = await capturarError(servicio.iniciarSesion({ email: 'ana@faltauno.uy', password: 'otra' }));

    expect(error.estado).toBe(401);
    expect(error.codigo).toBe('CREDENCIALES_INCORRECTAS');
  });

  it('E3: correo no registrado → la misma respuesta que con contraseña incorrecta (RNF-12)', async () => {
    const { servicio } = armarServicio([crearUsuarioGuardado()]);

    const conCorreoInexistente = await capturarError(servicio.iniciarSesion({ email: 'nadie@faltauno.uy', password: 'x' }));
    const conPasswordIncorrecta = await capturarError(servicio.iniciarSesion({ email: 'ana@faltauno.uy', password: 'x' }));

    expect(conCorreoInexistente.estado).toBe(conPasswordIncorrecta.estado);
    expect(conCorreoInexistente.codigo).toBe(conPasswordIncorrecta.codigo);
    expect(conCorreoInexistente.message).toBe(conPasswordIncorrecta.message);
  });

  it('E3: una cuenta creada con Google (sin contraseña) no puede entrar con contraseña', async () => {
    const { servicio } = armarServicio([crearUsuarioGuardado({ proveedorAuth: 'google', passwordHash: null })]);
    const error = await capturarError(servicio.iniciarSesion({ email: 'ana@faltauno.uy', password: PASSWORD_CORRECTA }));
    expect(error.codigo).toBe('CREDENCIALES_INCORRECTAS');
  });

  it('E4: al llegar al máximo de intentos fallidos bloquea la cuenta e informa el tiempo de espera', async () => {
    const guardado = crearUsuarioGuardado();
    const { servicio } = armarServicio([guardado]);

    for (let intento = 1; intento < MAXIMO_INTENTOS; intento++) {
      const error = await capturarError(servicio.iniciarSesion({ email: guardado.email, password: 'mal' }));
      expect(error.codigo).toBe('CREDENCIALES_INCORRECTAS');
    }
    const ultimo = await capturarError(servicio.iniciarSesion({ email: guardado.email, password: 'mal' }));

    expect(ultimo.estado).toBe(429);
    expect(ultimo.codigo).toBe('DEMASIADOS_INTENTOS');
    expect(ultimo.message).toContain(`${MINUTOS_DE_BLOQUEO} minutos`);
    expect(guardado.bloqueadoHasta).not.toBeNull();
  });

  it('E4: mientras dura el bloqueo, ni la contraseña correcta permite entrar', async () => {
    const enDiezMinutos = new Date(Date.now() + 10 * 60_000);
    const { servicio, sesiones } = armarServicio([crearUsuarioGuardado({ bloqueadoHasta: enDiezMinutos })]);

    const error = await capturarError(servicio.iniciarSesion({ email: 'ana@faltauno.uy', password: PASSWORD_CORRECTA }));

    expect(error.codigo).toBe('DEMASIADOS_INTENTOS');
    expect(error.message).toContain('10 minutos');
    expect(sesiones.abiertas.size).toBe(0);
  });

  it('E4: con el bloqueo vencido se puede volver a entrar', async () => {
    const haceUnMinuto = new Date(Date.now() - 60_000);
    const { servicio } = armarServicio([crearUsuarioGuardado({ bloqueadoHasta: haceUnMinuto })]);
    await expect(servicio.iniciarSesion({ email: 'ana@faltauno.uy', password: PASSWORD_CORRECTA })).resolves.toBeDefined();
  });

  it('E4: un correo no registrado también se bloquea, con la misma respuesta (RNF-12)', async () => {
    const { servicio } = armarServicio([]);

    for (let intento = 1; intento < MAXIMO_INTENTOS; intento++) {
      await capturarError(servicio.iniciarSesion({ email: 'nadie@faltauno.uy', password: 'mal' }));
    }
    const alBloquear = await capturarError(servicio.iniciarSesion({ email: 'nadie@faltauno.uy', password: 'mal' }));
    const durante = await capturarError(servicio.iniciarSesion({ email: 'nadie@faltauno.uy', password: 'mal' }));

    expect(alBloquear.codigo).toBe('DEMASIADOS_INTENTOS');
    expect(durante.codigo).toBe('DEMASIADOS_INTENTOS');
  });

  it('E1: credenciales correctas en una cuenta no verificada → 403 y sin sesión', async () => {
    const { servicio, sesiones } = armarServicio([crearUsuarioGuardado({ verificado: false })]);

    const error = await capturarError(servicio.iniciarSesion({ email: 'ana@faltauno.uy', password: PASSWORD_CORRECTA }));

    expect(error.estado).toBe(403);
    expect(error.codigo).toBe('CUENTA_NO_VERIFICADA');
    expect(sesiones.abiertas.size).toBe(0);
  });

  it('E1: con contraseña incorrecta en una cuenta no verificada responde E3, sin revelar el estado de la cuenta', async () => {
    const { servicio } = armarServicio([crearUsuarioGuardado({ verificado: false })]);
    const error = await capturarError(servicio.iniciarSesion({ email: 'ana@faltauno.uy', password: 'mal' }));
    expect(error.codigo).toBe('CREDENCIALES_INCORRECTAS');
  });

  it('ER1: si falla el almacenamiento de sesiones, el error se propaga y no se informa éxito', async () => {
    const { servicio, sesiones } = armarServicio([crearUsuarioGuardado()]);
    jest.spyOn(sesiones, 'crear').mockRejectedValue(new Error('Redis no responde'));

    await expect(servicio.iniciarSesion({ email: 'ana@faltauno.uy', password: PASSWORD_CORRECTA })).rejects.toThrow(
      'Redis no responde',
    );
  });
});

describe('CU01 A1 – Inicio de sesión con Google', () => {
  it('A1: con una cuenta verificada existente crea la sesión y guarda el identificador de Google (RN5)', async () => {
    const guardado = crearUsuarioGuardado();
    const { servicio, sesiones } = armarServicio([guardado]);

    const respuesta = await servicio.iniciarSesionConGoogle({ idToken: 'token-valido' });

    expect(sesiones.abiertas.get(respuesta.token)).toBe(guardado.id);
    expect(guardado.proveedorId).toBe('google-sub-123');
    // Sigue siendo una cuenta local: conserva su contraseña
    expect(guardado.proveedorAuth).toBe('local');
    expect(guardado.passwordHash).not.toBeNull();
  });

  it('A1: con una cuenta creada con Google ingresa sin cambios', async () => {
    const guardado = crearUsuarioGuardado({ proveedorAuth: 'google', proveedorId: 'google-sub-123', passwordHash: null });
    const { servicio } = armarServicio([guardado]);
    await expect(servicio.iniciarSesionConGoogle({ idToken: 'token-valido' })).resolves.toBeDefined();
  });

  it('RN6: una cuenta pendiente de verificación queda verificada, sin contraseña y con sus sesiones anteriores cerradas', async () => {
    const guardado = crearUsuarioGuardado({ verificado: false });
    const { servicio, sesiones } = armarServicio([guardado]);
    sesiones.abiertas.set('sesion-vieja', guardado.id);

    const respuesta = await servicio.iniciarSesionConGoogle({ idToken: 'token-valido' });

    expect(guardado.verificado).toBe(true);
    expect(guardado.passwordHash).toBeNull();
    expect(guardado.proveedorId).toBe('google-sub-123');
    expect(sesiones.abiertas.has('sesion-vieja')).toBe(false);
    expect(sesiones.abiertas.has(respuesta.token)).toBe(true);
  });

  it('E2: si no hay una cuenta con ese correo → 404 CUENTA_NO_ENCONTRADA y sin sesión', async () => {
    const { servicio, sesiones } = armarServicio([]);

    const error = await capturarError(servicio.iniciarSesionConGoogle({ idToken: 'token-valido' }));

    expect(error.estado).toBe(404);
    expect(error.codigo).toBe('CUENTA_NO_ENCONTRADA');
    expect(sesiones.abiertas.size).toBe(0);
  });

  it('ER2: si Google rechaza el token o no responde, el error se propaga y no se crea sesión', async () => {
    const errorDeGoogle = new AppError(503, 'GOOGLE_NO_DISPONIBLE', 'No fue posible iniciar sesión con Google en este momento.');
    const { servicio, sesiones } = armarServicio([crearUsuarioGuardado()], new VerificadorGoogleFalso(errorDeGoogle));

    const error = await capturarError(servicio.iniciarSesionConGoogle({ idToken: 'token' }));

    expect(error.codigo).toBe('GOOGLE_NO_DISPONIBLE');
    expect(sesiones.abiertas.size).toBe(0);
  });
});
