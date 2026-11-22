import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { Valoracion } from '../src/modulos/valoraciones/valoracion.entidad';
import { ValoracionesRepositorio } from '../src/modulos/valoraciones/valoraciones.repositorio';

const postgresUrl = process.env.POSTGRES_URL_TEST;
const integracion = postgresUrl ? describe : describe.skip;

/** CU21: las consultas del repositorio contra PostgreSQL real, en un esquema propio que se borra al terminar. */
integracion('CU21 – ValoracionesRepositorio con PostgreSQL', () => {
  const esquema = `cu21_${randomUUID().replaceAll('-', '')}`;
  const actividadId = randomUUID();
  const [elian, carla, diego, ajeno] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  let administrador: Pool;
  let db: Pool;
  let repositorio: ValoracionesRepositorio;

  beforeAll(async () => {
    const destino = new URL(postgresUrl!);
    if (!['localhost', '127.0.0.1'].includes(destino.hostname) || destino.pathname !== '/faltauno_test') {
      throw new Error('Estas pruebas requieren PostgreSQL faltauno_test en localhost.');
    }
    administrador = new Pool({ connectionString: postgresUrl });
    await administrador.query('CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public');
    await administrador.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await administrador.query(`CREATE SCHEMA ${esquema}`);
    db = new Pool({ connectionString: postgresUrl, options: `-c search_path=${esquema},public`, max: 2 });
    for (const migracion of ['001_esquema_inicial.sql', '003_indice_participacion_actividad.sql']) {
      await db.query(readFileSync(path.resolve(__dirname, '../../db/migrations', migracion), 'utf8'));
    }

    await db.query(
      `INSERT INTO usuario (id, nombre, email, verificado) VALUES
         ($1, 'Elian', $5, TRUE), ($2, 'Carla', $6, TRUE), ($3, 'Diego', $7, TRUE), ($4, 'Ajeno', $8, TRUE)`,
      [elian, carla, diego, ajeno, ...['e', 'c', 'd', 'a'].map((letra) => `${esquema}-${letra}@test.invalid`)],
    );
    const deporte = await db.query<{ id: number }>("INSERT INTO deporte (nombre) VALUES ('Surf') RETURNING id");
    await db.query(
      `INSERT INTO actividad (id, organizador_id, deporte_id, nombre, fecha_hora_inicio, cupo_maximo, nivel,
                              origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng,
                              departamento, estado)
       VALUES ($1, $2, $3, 'Surf', now() - interval '1 day', 6, 'intermedio',
               'Origen', -34.9, -56.1, 'Destino', -34.6, -54.1, 'Rocha', 'iniciada')`,
      [actividadId, carla, deporte.rows[0].id],
    );
    await db.query(
      `INSERT INTO participacion (actividad_id, usuario_id, es_organizador, fecha_union) VALUES
         ($1, $2, TRUE, now() - interval '3 days'), ($1, $3, FALSE, now() - interval '2 days'), ($1, $4, FALSE, now() - interval '1 day')`,
      [actividadId, carla, elian, diego],
    );
    repositorio = new ValoracionesRepositorio(db);
  }, 30000);

  afterAll(async () => {
    if (db) await db.end();
    if (administrador) {
      await administrador.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
      await administrador.end();
    }
  });

  it('FP paso 1 / RN1: devuelve el estado y si el usuario participó', async () => {
    await expect(repositorio.buscarActividadParaValorar(actividadId, elian)).resolves.toEqual({
      estado: 'iniciada',
      participa: true,
    });
    await expect(repositorio.buscarActividadParaValorar(actividadId, ajeno)).resolves.toEqual({
      estado: 'iniciada',
      participa: false,
    });
    await expect(repositorio.buscarActividadParaValorar(randomUUID(), elian)).resolves.toBeNull();
    await expect(repositorio.participo(actividadId, diego)).resolves.toBe(true);
    await expect(repositorio.participo(actividadId, ajeno)).resolves.toBe(false);
  });

  it('FP pasos 2 y 8, A2 / RN2 y paso 9: lista a los demás, guarda, reemplaza y el promedio ya la incluye', async () => {
    const antes = await repositorio.buscarParticipantesParaValorar(actividadId, elian);
    expect(antes.map((p) => [p.usuario.nombre, p.esOrganizador, p.miValoracion])).toEqual([
      ['Carla', true, null],
      ['Diego', false, null],
    ]);

    await repositorio.guardar(new Valoracion(actividadId, elian, carla, 2, 'Llegó tarde.'));
    await repositorio.guardar(new Valoracion(actividadId, elian, carla, 5, null));

    const despues = await repositorio.buscarParticipantesParaValorar(actividadId, elian);
    expect(despues[0].miValoracion).toEqual({ puntaje: 5, comentario: null });
    expect(despues[1].miValoracion).toBeNull();
    const filas = await db.query('SELECT puntaje FROM valoracion WHERE evaluador_id = $1 AND evaluado_id = $2', [elian, carla]);
    expect(filas.rows).toEqual([{ puntaje: 5 }]);
    await expect(repositorio.resumenRecibido(carla)).resolves.toEqual({ promedio: 5, cantidad: 1 });
  });
});
