import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import type { FiltrosDeBusqueda } from '../src/modulos/actividades/actividades.dto';
import { ActividadesRepositorio } from '../src/modulos/actividades/actividades.repositorio';

const destino = process.env.POSTGRES_URL_TEST;
const integracion = destino ? describe : describe.skip;

integracion('CU08 dashboard – secciones con PostgreSQL real', () => {
  const esquema = `dashboard_${randomUUID().replaceAll('-', '')}`;
  const yo = randomUUID();
  const otro = randomUUID();
  const tercero = randomUUID();
  let administrador: Pool;
  let db: Pool;
  let repositorio: ActividadesRepositorio;
  let surf: number;
  let trekking: number;
  const filtros: FiltrosDeBusqueda = { deportes: [], departamentos: [], niveles: [], franjas: [] };

  beforeAll(async () => {
    const url = new URL(destino!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/faltauno_test') {
      throw new Error('El dashboard solo se prueba contra faltauno_test local.');
    }
    administrador = new Pool({ connectionString: destino });
    await administrador.query('CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public');
    await administrador.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await administrador.query(`CREATE SCHEMA ${esquema}`);
    db = new Pool({ connectionString: destino, options: `-c search_path=${esquema},public` });
    await db.query(readFileSync(path.resolve(__dirname, '../../db/migrations/001_esquema_inicial.sql'), 'utf8'));
    await db.query(
      readFileSync(path.resolve(__dirname, '../../db/migrations/004_cu10_origen_opcional_destino_provisional.sql'), 'utf8'),
    );
    for (const id of [yo, otro, tercero]) {
      await db.query('INSERT INTO usuario (id,nombre,email,verificado) VALUES ($1,$2,$3,TRUE)', [id, id, `${id}@test.invalid`]);
    }
    surf = (await db.query("INSERT INTO deporte (nombre) VALUES ('Surf') RETURNING id")).rows[0].id;
    trekking = (await db.query("INSERT INTO deporte (nombre) VALUES ('Trekking') RETURNING id")).rows[0].id;
    repositorio = new ActividadesRepositorio(db);
  });

  afterEach(async () => {
    if (db) await db.query('DELETE FROM actividad');
  });
  afterAll(async () => {
    if (db) await db.end();
    if (administrador) {
      await administrador.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
      await administrador.end();
    }
  });

  async function actividad(
    nombre: string,
    organizador: string | null,
    deporte = surf,
    completa = false,
    horas = 24,
    estado = 'programada',
  ) {
    const id = randomUUID();
    await db.query(
      `INSERT INTO actividad
      (id,nombre,organizador_id,deporte_id,fecha_hora_inicio,cupo_maximo,nivel,destino_direccion,destino_lat,destino_lng,departamento,estado)
      VALUES ($1,$2,$3,$4,now() + $5 * interval '1 hour',2,'intermedio','Playa',-34.9,-56.2,'Montevideo',$6)`,
      [id, nombre, organizador, deporte, horas, estado],
    );
    if (organizador) {
      const participacion = await db.query(
        'INSERT INTO participacion (actividad_id,usuario_id,es_organizador) VALUES ($1,$2,TRUE) RETURNING id',
        [id, organizador],
      );
      if (completa)
        await db.query("INSERT INTO invitado_externo (participacion_id,nombre) VALUES ($1,'Invitado')", [
          participacion.rows[0].id,
        ]);
    }
    return id;
  }

  async function ids(grupo: FiltrosDeBusqueda['grupo'], deportes: number[] = [], usuario = yo, pagina = 1, tamano = 10) {
    const resultado = await repositorio.buscarDisponibles({ ...filtros, grupo, deportes }, pagina, tamano, usuario);
    return { ids: resultado.actividades.map((encontrada) => encontrada.actividad.id), hayMas: resultado.hayMas };
  }

  it('separa organizador, participante y ajeno sin duplicaciones e incluye propias completas', async () => {
    const gestiono = await actividad('Gestiono completa', yo, surf, true);
    const unido = await actividad('Estoy unido', otro);
    await db.query('INSERT INTO participacion (actividad_id,usuario_id) VALUES ($1,$2)', [unido, yo]);
    const disponible = await actividad('Disponible', otro);
    const anonima = await actividad('Organizador eliminado', null);
    await actividad('Completa ajena', otro, surf, true);
    await actividad('Pasada', yo, surf, false, -24);
    await actividad('Cancelada', yo, surf, false, 24, 'cancelada');
    expect((await ids('gestionando')).ids).toEqual([gestiono]);
    expect((await ids('unido')).ids).toEqual([unido]);
    expect(new Set((await ids('otras')).ids)).toEqual(new Set([disponible, anonima]));
    expect((await ids(undefined)).ids).not.toContain(gestiono);
    expect((await ids('gestionando', [], tercero)).ids).toEqual([]);
    expect((await ids('unido', [], tercero)).ids).toEqual([]);
  });

  it('filtra las demás por deportes y pagina cada sección sin mezclar roles', async () => {
    const propia1 = await actividad('Propia 1', yo, trekking);
    const propia2 = await actividad('Propia 2', yo, trekking);
    const deSurf = await actividad('Surf ajena', otro, surf);
    await actividad('Trekking ajena', otro, trekking);
    const primera = await ids('gestionando', [], yo, 1, 1);
    const segunda = await ids('gestionando', [], yo, 2, 1);
    expect(primera.hayMas).toBe(true);
    expect(segunda.hayMas).toBe(false);
    expect(new Set([...primera.ids, ...segunda.ids])).toEqual(new Set([propia1, propia2]));
    expect((await ids('otras', [surf])).ids).toEqual([deSurf]);
    expect((await ids('otras', [])).ids).toHaveLength(2);
  });

  it('expone en las tarjetas de otras actividades los dos indicadores de traslado persistidos', async () => {
    const id = await actividad('Traslado visible antes de unirse', otro);
    for (const [tieneVehiculo, requiereVehiculo] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]) {
      await db.query('UPDATE actividad SET organizador_tiene_vehiculo = $2, requiere_vehiculo = $3 WHERE id = $1', [
        id,
        tieneVehiculo,
        requiereVehiculo,
      ]);
      const resultado = await repositorio.buscarDisponibles({ ...filtros, grupo: 'otras' }, 1, 10, yo);
      expect(resultado.actividades[0]).toMatchObject({ tieneVehiculo, requiereVehiculo });
    }
  });
});
