import type { Ejecutor } from '../../infra/postgres';
import { Deporte } from './deporte.entidad';

interface FilaDeporte {
  id: number;
  nombre: string;
}

/** Acceso a las tablas deporte y usuario_deporte. */
export class DeportesRepositorio {
  constructor(private readonly db: Ejecutor) {}

  /**
   * CU04 FP paso 2 / A1 paso 2: deportes que practica el usuario.
   * Los deportes desactivados del catálogo no se muestran en el perfil. Usa la PK de usuario_deporte.
   */
  async buscarActivosDeUsuario(usuarioId: string): Promise<Deporte[]> {
    const resultado = await this.db.query<FilaDeporte>(
      `SELECT d.id, d.nombre
       FROM usuario_deporte ud
       JOIN deporte d ON d.id = ud.deporte_id
       WHERE ud.usuario_id = $1 AND d.activo
       ORDER BY d.nombre`,
      [usuarioId],
    );
    return resultado.rows.map((fila) => new Deporte(fila.id, fila.nombre));
  }
}
