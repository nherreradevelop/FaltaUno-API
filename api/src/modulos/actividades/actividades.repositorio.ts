import type { Ejecutor } from '../../infra/postgres';
import { aActividadCreada, type ActividadCreadaDto, type DatosCrearActividad, type UbicacionActividad } from './actividades.dto';

/** SQL y conversión de filas del módulo de actividades. Todo alta usa el mismo Ejecutor transaccional. */
export class ActividadesRepositorio {
  constructor(private readonly db: Ejecutor) {}

  async deportesActivos(): Promise<{ id: number; nombre: string }[]> {
    const resultado = await this.db.query<{ id: number; nombre: string }>(
      'SELECT id, nombre FROM deporte WHERE activo ORDER BY nombre',
    );
    return resultado.rows;
  }

  async cuentaActiva(usuarioId: string): Promise<boolean> {
    const resultado = await this.db.query('SELECT id FROM usuario WHERE id = $1 AND estado = $2 AND verificado FOR SHARE', [
      usuarioId,
      'activo',
    ]);
    return resultado.rows.length > 0;
  }

  /** Serializa los reintentos del mismo UUID sin tablas nuevas de idempotencia. */
  async bloquearAlta(id: string): Promise<void> {
    await this.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id]);
  }

  async buscarCreada(id: string, usuarioId: string): Promise<ActividadCreadaDto | null> {
    const resultado = await this.db.query<{
      id: string;
      nombre: string;
      cupo_maximo: number;
      cantidad: number;
      costo_centavos: string | null;
      destino_provisional: boolean;
    }>(
      `SELECT a.id, a.nombre, a.cupo_maximo, a.destino_provisional, (a.costo_estimado * 100)::bigint::text AS costo_centavos,
        (SELECT count(*)::integer FROM participacion p WHERE p.actividad_id = a.id) +
        (SELECT count(*)::integer FROM invitado_externo i JOIN participacion p ON p.id = i.participacion_id
          WHERE p.actividad_id = a.id) AS cantidad
       FROM actividad a WHERE a.id = $1 AND a.organizador_id = $2`,
      [id, usuarioId],
    );
    const fila = resultado.rows[0];
    if (!fila) return null;
    return aActividadCreada(
      fila.id,
      {
        nombre: fila.nombre,
        cupoMaximo: fila.cupo_maximo,
        invitados: Array.from({ length: fila.cantidad - 1 }, () => ''),
        costoEstimadoCentavos: fila.costo_centavos === null ? null : Number(fila.costo_centavos),
      },
      fila.destino_provisional,
    );
  }

  async crear(
    id: string,
    usuarioId: string,
    datos: DatosCrearActividad,
    origen: UbicacionActividad | null,
    destino: UbicacionActividad,
    destinoProvisional: boolean,
  ): Promise<void> {
    // Centésimos -> decimal exacto para NUMERIC, sin división de punto flotante.
    const costo = datos.costoEstimadoCentavos;
    const costoDecimal = costo === null ? null : `${Math.trunc(costo / 100)}.${String(costo % 100).padStart(2, '0')}`;
    await this.db.query(
      `INSERT INTO actividad (id, organizador_id, deporte_id, nombre, descripcion, fecha_hora_inicio, cupo_maximo, nivel,
        origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng, departamento,
        organizador_tiene_vehiculo, lugares_vehiculo, requiere_vehiculo, costo_estimado, destino_provisional, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'programada')`,
      [
        id,
        usuarioId,
        datos.deporteId,
        datos.nombre,
        datos.descripcion,
        datos.fechaHoraInicio,
        datos.cupoMaximo,
        datos.nivel,
        origen?.direccion ?? null,
        origen?.lat ?? null,
        origen?.lng ?? null,
        destino.direccion,
        destino.lat,
        destino.lng,
        destino.departamento,
        datos.tieneVehiculo,
        datos.lugaresVehiculo,
        datos.requiereVehiculo,
        costoDecimal,
        destinoProvisional,
      ],
    );
    const participacion = await this.db.query<{ id: string }>(
      `INSERT INTO participacion (actividad_id, usuario_id, es_organizador, tiene_vehiculo, lugares_vehiculo,
        punto_partida_direccion, punto_partida_lat, punto_partida_lng)
       VALUES ($1,$2,TRUE,$3,$4,$5,$6,$7) RETURNING id`,
      [
        id,
        usuarioId,
        datos.tieneVehiculo,
        datos.lugaresVehiculo,
        origen?.direccion ?? null,
        origen?.lat ?? null,
        origen?.lng ?? null,
      ],
    );
    if (datos.invitados.length > 0) {
      await this.db.query('INSERT INTO invitado_externo (participacion_id, nombre) SELECT $1, unnest($2::text[])', [
        participacion.rows[0].id,
        datos.invitados,
      ]);
    }
  }
}
