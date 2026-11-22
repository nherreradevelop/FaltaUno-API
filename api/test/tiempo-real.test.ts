import { autenticarConexion } from '../src/infra/tiempo-real';

describe('CU40 A3 – autenticación del canal en tiempo real (RNF-13)', () => {
  const sesiones = {
    buscarUsuarioId: async (token: string) => (token === 'token-vigente' ? 'usuario-1' : null),
  };

  it('acepta una sesión vigente y devuelve su usuario', async () => {
    await expect(autenticarConexion('token-vigente', sesiones)).resolves.toBe('usuario-1');
  });

  it.each([[undefined], [''], [123], ['token-vencido']])('rechaza la conexión con el token %p', async (token) => {
    await expect(autenticarConexion(token, sesiones)).resolves.toBeNull();
  });
});
