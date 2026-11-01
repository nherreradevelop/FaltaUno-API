import { crearUsuarioGuardado, PASSWORD_CORRECTA, UsuariosEnMemoria } from './dobles';

const AHORA = new Date('2026-10-29T12:00:00Z');

async function usuarioCon(cambios: Parameters<typeof crearUsuarioGuardado>[0]) {
  const repositorio = new UsuariosEnMemoria([crearUsuarioGuardado(cambios)]);
  const usuario = await repositorio.buscarPorId('usuario-1');
  if (!usuario) throw new Error('No se armó el usuario de prueba');
  return usuario;
}

describe('Usuario (entidad)', () => {
  it('RN3: está bloqueado solo mientras bloqueadoHasta es futuro', async () => {
    const bloqueado = await usuarioCon({ bloqueadoHasta: new Date('2026-10-29T12:05:00Z') });
    const vencido = await usuarioCon({ bloqueadoHasta: new Date('2026-10-29T11:55:00Z') });
    const sinBloqueo = await usuarioCon({ bloqueadoHasta: null });

    expect(bloqueado.estaBloqueado(AHORA)).toBe(true);
    expect(vencido.estaBloqueado(AHORA)).toBe(false);
    expect(sinBloqueo.estaBloqueado(AHORA)).toBe(false);
  });

  it('E4: los minutos restantes se redondean hacia arriba', async () => {
    const usuario = await usuarioCon({ bloqueadoHasta: new Date('2026-10-29T12:04:01Z') });
    expect(usuario.minutosDeBloqueoRestantes(AHORA)).toBe(5);
  });

  it('E4: sin bloqueo vigente quedan 0 minutos', async () => {
    const usuario = await usuarioCon({ bloqueadoHasta: new Date('2026-10-29T11:00:00Z') });
    expect(usuario.minutosDeBloqueoRestantes(AHORA)).toBe(0);
  });

  it('RN2: la contraseña se compara contra el hash', async () => {
    const usuario = await usuarioCon({});
    await expect(usuario.coincidePassword(PASSWORD_CORRECTA)).resolves.toBe(true);
    await expect(usuario.coincidePassword('otra')).resolves.toBe(false);
  });

  it('RN2: una cuenta sin contraseña nunca coincide', async () => {
    const usuario = await usuarioCon({ passwordHash: null });
    await expect(usuario.coincidePassword('')).resolves.toBe(false);
  });

  it('indica si tiene intentos o un bloqueo que limpiar', async () => {
    expect((await usuarioCon({})).tieneIntentosRegistrados()).toBe(false);
    expect((await usuarioCon({ intentosFallidos: 2 })).tieneIntentosRegistrados()).toBe(true);
    expect((await usuarioCon({ bloqueadoHasta: new Date('2026-10-29T11:00:00Z') })).tieneIntentosRegistrados()).toBe(true);
  });
});
