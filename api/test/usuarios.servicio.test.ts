import { AppError } from '../src/comun/errores';
import { UsuariosServicio } from '../src/modulos/usuarios/usuarios.servicio';
import { crearUsuarioGuardado, UsuariosEnMemoria } from './dobles';

describe('Usuario de la sesión actual (GET /api/usuarios/yo)', () => {
  it('devuelve los datos públicos del usuario de la sesión', async () => {
    const servicio = new UsuariosServicio(new UsuariosEnMemoria([crearUsuarioGuardado()]));
    await expect(servicio.obtenerUsuarioActual('usuario-1')).resolves.toEqual({
      id: 'usuario-1',
      nombre: 'Ana Pérez',
      email: 'ana@faltauno.uy',
      fotoUrl: null,
    });
  });

  it('si la cuenta ya no está activa responde 401 para que el cliente cierre la sesión', async () => {
    const servicio = new UsuariosServicio(new UsuariosEnMemoria([]));
    await expect(servicio.obtenerUsuarioActual('usuario-1')).rejects.toMatchObject({ estado: 401, codigo: 'SESION_INVALIDA' });
    await expect(servicio.obtenerUsuarioActual('usuario-1')).rejects.toBeInstanceOf(AppError);
  });
});
