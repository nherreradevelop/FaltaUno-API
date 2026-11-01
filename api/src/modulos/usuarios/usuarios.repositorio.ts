import type { Ejecutor } from '../../infra/postgres';
import { Usuario, type ProveedorAuth } from './usuario.entidad';

interface FilaUsuario {
  id: string;
  nombre: string;
  email: string;
  foto_url: string | null;
  proveedor_auth: ProveedorAuth;
  proveedor_id: string | null;
  verificado: boolean;
  password_hash: string | null;
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
}

const COLUMNAS_USUARIO = `id, nombre, email, foto_url, proveedor_auth, proveedor_id, verificado,
  password_hash, intentos_fallidos, bloqueado_hasta`;

function aUsuario(fila: FilaUsuario): Usuario {
  return new Usuario(
    fila.id,
    fila.nombre,
    fila.email,
    fila.foto_url,
    fila.proveedor_auth,
    fila.proveedor_id,
    fila.verificado,
    fila.password_hash,
    fila.intentos_fallidos,
    fila.bloqueado_hasta,
  );
}

/** Acceso a la tabla usuario. Solo considera cuentas activas: las de cierre pendiente (CU33) no existen para el login. */
export class UsuariosRepositorio {
  constructor(private readonly db: Ejecutor) {}

  /** Usa el índice uk_usuario_email (lower(email)). */
  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const resultado = await this.db.query<FilaUsuario>(
      `SELECT ${COLUMNAS_USUARIO} FROM usuario WHERE lower(email) = lower($1) AND estado = 'activo'`,
      [email],
    );
    const fila = resultado.rows[0];
    return fila ? aUsuario(fila) : null;
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    const resultado = await this.db.query<FilaUsuario>(
      `SELECT ${COLUMNAS_USUARIO} FROM usuario WHERE id = $1 AND estado = 'activo'`,
      [id],
    );
    const fila = resultado.rows[0];
    return fila ? aUsuario(fila) : null;
  }

  /**
   * CU01 RN3: suma un intento fallido y, al llegar al máximo, bloquea la cuenta y reinicia el contador.
   * Es una sola sentencia para que dos intentos simultáneos no pisen el contador.
   * Devuelve hasta cuándo quedó bloqueada, o null si no se bloqueó.
   */
  async registrarIntentoFallido(id: string, maximoIntentos: number, minutosDeBloqueo: number): Promise<Date | null> {
    const resultado = await this.db.query<{ bloqueado_hasta: Date | null }>(
      `UPDATE usuario SET
         intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
         bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE bloqueado_hasta END
       WHERE id = $1
       RETURNING bloqueado_hasta`,
      [id, maximoIntentos, minutosDeBloqueo],
    );
    const bloqueadoHasta = resultado.rows[0]?.bloqueado_hasta ?? null;
    const quedoBloqueado = bloqueadoHasta !== null && bloqueadoHasta > new Date();
    return quedoBloqueado ? bloqueadoHasta : null;
  }

  /** CU01 RN3: los intentos son consecutivos; un ingreso correcto los reinicia. */
  async reiniciarIntentosFallidos(id: string): Promise<void> {
    await this.db.query(`UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1`, [id]);
  }

  /**
   * CU01 RN6: vincula Google a una cuenta pendiente de verificación: la marca verificada y anula su contraseña.
   * La condición verificado = FALSE hace que la operación sea atómica sin transacción.
   * Devuelve true si la cuenta se modificó.
   */
  async verificarYVincularProveedor(id: string, proveedorId: string): Promise<boolean> {
    const resultado = await this.db.query(
      `UPDATE usuario SET verificado = TRUE, password_hash = NULL, proveedor_id = $2
       WHERE id = $1 AND verificado = FALSE`,
      [id, proveedorId],
    );
    return resultado.rowCount === 1;
  }

  /** CU01 RN5: guarda el identificador del proveedor en una cuenta ya verificada. */
  async guardarProveedorId(id: string, proveedorId: string): Promise<void> {
    await this.db.query(`UPDATE usuario SET proveedor_id = $2 WHERE id = $1`, [id, proveedorId]);
  }
}
