import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import express from 'express';
import { Pool } from 'pg';
import { crearManejadorErrores } from '../src/comun/middlewares/manejadorErrores';
import type { Contexto } from '../src/contexto';
import { leerConfig } from '../src/config/env';
import { logger } from '../src/infra/logger';
import { crearRutasActividades } from '../src/modulos/actividades/actividades.rutas';
import { ActividadesRepositorio } from '../src/modulos/actividades/actividades.repositorio';

const destino = process.env.POSTGRES_URL_TEST;
const integracion = destino ? describe : describe.skip;

/** HTTP, autorización y SQL reales, exclusivamente en un esquema temporal de faltauno_test local. */
integracion('CU42 – HTTP y PostgreSQL', () => {
  const esquema = `cu42_${randomUUID().replaceAll('-', '')}`;
  const yo = randomUUID();
  const otro = randomUUID();
  const vacio = randomUUID();
  let admin: Pool;
  let db: Pool;
  let servidor: Server;
  let url: string;
  let deporte: number;
  let consulta: jest.SpyInstance;
  const config = leerConfig({
    NODE_ENV: 'test',
    POSTGRES_URL: 'local',
    REDIS_URL: 'local',
    MONGO_URL: 'local',
    SESION_DIAS: '1',
    LOGIN_MAX_INTENTOS: '5',
    LOGIN_BLOQUEO_MINUTOS: '15',
    LIMITE_AUTH_SOLICITUDES: '100',
    LIMITE_AUTH_VENTANA_MINUTOS: '1',
    ACTIVIDAD_DESTINO_PROVISIONAL_LAT: '-34.9',
    ACTIVIDAD_DESTINO_PROVISIONAL_LNG: '-56.2',
    ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO: 'Montevideo',
  });

  beforeAll(async () => {
    const uri = new URL(destino!);
    if (!['localhost', '127.0.0.1'].includes(uri.hostname) || uri.pathname !== '/faltauno_test') {
      throw new Error('CU42 solo permite PostgreSQL faltauno_test en localhost.');
    }
    admin = new Pool({ connectionString: destino });
    await admin.query('CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public');
    await admin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await admin.query(`CREATE SCHEMA ${esquema}`);
    db = new Pool({ connectionString: destino, options: `-c search_path=${esquema},public` });
    await db.query(readFileSync(path.resolve(__dirname, '../../db/migrations/001_esquema_inicial.sql'), 'utf8'));
    for (const id of [yo, otro, vacio]) {
      await db.query('INSERT INTO usuario (id,nombre,email,verificado) VALUES ($1,$2,$3,TRUE)', [id, id, `${id}@test.invalid`]);
    }
    deporte = (await db.query("INSERT INTO deporte (nombre) VALUES ('Surf') RETURNING id")).rows[0].id;
    const sesiones = { buscarUsuarioId: async (token: string) => (token === 'yo' ? yo : token === 'vacio' ? vacio : null) };
    const app = express();
    app.use('/api/actividades', crearRutasActividades({ config, db, sesiones, logger } as unknown as Contexto));
    app.use(crearManejadorErrores(logger));
    servidor = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/actividades/iniciadas`;
    consulta = jest.spyOn(db, 'query');
  }, 30000);

  afterEach(async () => {
    consulta?.mockClear();
    if (db) await db.query('DELETE FROM actividad');
  });
  afterAll(async () => {
    consulta?.mockRestore();
    if (servidor) await new Promise<void>((resolve) => servidor.close(() => resolve()));
    if (db) await db.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
      await admin.end();
    }
  });

  async function crear(estado: string, miembro: string | null, organizo = false, horas = -24) {
    const id = randomUUID();
    await db.query(
      `INSERT INTO actividad (id,nombre,organizador_id,deporte_id,fecha_hora_inicio,cupo_maximo,nivel,
        origen_direccion,origen_lat,origen_lng,destino_direccion,destino_lat,destino_lng,departamento,estado)
       VALUES ($1,'Surf',$2,$3,now()+$4*interval '1 hour',2,'intermedio','Origen',-34.9,-56.2,'Playa',-34.9,-56.2,'Montevideo',$5)`,
      [id, organizo ? yo : otro, deporte, horas, estado],
    );
    if (miembro)
      await db.query('INSERT INTO participacion (actividad_id,usuario_id,es_organizador) VALUES ($1,$2,$3)', [
        id,
        miembro,
        organizo,
      ]);
    return id;
  }
  const pedir = (query = '', token = 'yo') => fetch(url + query, { headers: { Authorization: `Bearer ${token}` } });

  it.each([false, true])(
    'A4: detecta en la base una iniciada de hoy como organizador=%s, con búsqueda y página vacías',
    async (organizo) => {
      await crear('iniciada', yo, organizo, 0);
      const r = await fetch(`${url.replace('/iniciadas', '')}?grupo=otras&departamentos=Rocha&pagina=3&usuarioId=${otro}`, {
        headers: { Authorization: 'Bearer yo' },
      });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ actividades: [], pagina: 3, hayIniciadasHoy: true });
      const ajeno = await fetch(`${url.replace('/iniciadas', '')}?grupo=otras&usuarioId=${yo}`, {
        headers: { Authorization: 'Bearer vacio' },
      });
      expect((await ajeno.json()).hayIniciadasHoy).toBe(false);
    },
  );

  it('A4: omite actividades ajenas, programadas, archivadas, canceladas y de otros días', async () => {
    await crear('iniciada', otro, false, 0);
    for (const estado of ['programada', 'archivada', 'cancelada']) await crear(estado, yo, false, 0);
    await crear('iniciada', yo, false, -48);
    await crear('iniciada', yo, false, 48);
    expect(await new ActividadesRepositorio(db).tieneIniciadasHoy(yo, new Date())).toBe(false);
  });

  it.each([
    ['2026-11-26T02:59:59.999Z', false],
    ['2026-11-26T03:00:00.000Z', true],
    ['2026-11-27T02:59:59.999Z', true],
    ['2026-11-27T03:00:00.000Z', false],
  ])('A4: el inicio %s se evalúa por el día de Uruguay, no por UTC', async (inicio, esperado) => {
    const id = await crear('iniciada', yo);
    await db.query('UPDATE actividad SET fecha_hora_inicio=$2 WHERE id=$1', [id, inicio]);
    expect(await new ActividadesRepositorio(db).tieneIniciadasHoy(yo, new Date('2026-11-27T01:00:00Z'))).toBe(esperado);
  });

  it('FP/RN1/RN2: incluye organizador y participante; excluye ajenas y todos los demás estados', async () => {
    const propia = await crear('iniciada', yo, true, -72);
    const unida = await crear('iniciada', yo, false, -24);
    await crear('iniciada', otro);
    for (const estado of ['programada', 'archivada', 'cancelada']) await crear(estado, yo);
    consulta.mockClear();
    const r = await pedir(`?usuarioId=${otro}&estado=archivada`);
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.actividades.map((a: { id: string }) => a.id)).toEqual([unida, propia]);
    expect(cuerpo.actividades.map((a: { esOrganizador: boolean }) => a.esOrganizador)).toEqual([false, true]);
    expect(cuerpo.actividades.every((a: { estado: string }) => a.estado === 'iniciada')).toBe(true);
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it('A1/RN3/RN4: pagina de más reciente a más antigua, incluso completas y con plazo vencido', async () => {
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push(await crear('iniciada', yo, true, -24 * (30 - i)));
    // Organizador más un invitado ocupan los dos lugares: estar completa no la excluye de CU42.
    await db.query(
      "INSERT INTO invitado_externo (participacion_id,nombre) SELECT id,'Invitado' FROM participacion WHERE usuario_id=$1",
      [yo],
    );
    const primera = await (await pedir()).json();
    const segunda = await (await pedir('?pagina=2')).json();
    expect(primera.actividades).toHaveLength(10);
    expect(primera.hayMas).toBe(true);
    expect(segunda.actividades).toHaveLength(2);
    expect(segunda.hayMas).toBe(false);
    expect([...primera.actividades, ...segunda.actividades].map((a: { id: string }) => a.id)).toEqual(ids.reverse());
  });

  it('A2/E2: deja de incluir una actividad archivada tras la consulta anterior', async () => {
    const id = await crear('iniciada', yo);
    expect((await (await pedir()).json()).actividades).toHaveLength(1);
    await db.query("UPDATE actividad SET estado='archivada' WHERE id=$1", [id]);
    expect((await (await pedir()).json()).actividades).toEqual([]);
  });

  it('E1: una cuenta sin participaciones recibe una lista vacía', async () => {
    await crear('iniciada', yo);
    expect(await (await pedir('', 'vacio')).json()).toEqual({ actividades: [], pagina: 1, hayMas: false });
  });

  it('ER2: rechaza credenciales ausentes o vencidas antes de consultar PostgreSQL', async () => {
    consulta.mockClear();
    expect((await fetch(url)).status).toBe(401);
    expect((await pedir('', 'vencido')).status).toBe(401);
    expect(consulta).not.toHaveBeenCalled();
  });

  it('rechaza una página inválida con 400', async () => {
    consulta.mockClear();
    expect((await pedir('?pagina=0')).status).toBe(400);
    expect(consulta).not.toHaveBeenCalled();
  });

  it('ER1: responde 500 sin exponer el error de la base', async () => {
    consulta.mockRejectedValueOnce(new Error('dato interno sensible'));
    const r = await pedir();
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('dato interno sensible');
  });
});
