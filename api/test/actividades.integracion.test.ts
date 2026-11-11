import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { crearApp } from '../src/app';
import { leerConfig } from '../src/config/env';
import { GoogleMaps } from '../src/infra/google-maps';
import { GoogleGeocoding } from '../src/infra/google-geocoding';
import { logger } from '../src/infra/logger';
import { VerificadorGoogle } from '../src/infra/oauth';
import { SesionesRepositorio } from '../src/modulos/auth/sesiones.repositorio';
import { datosActividad, DESTINO_PROVISIONAL_PRUEBA, LUGAR_ACTIVIDAD } from './actividades.fixtures';
import { DESTINO_PROVISIONAL_ID } from '../src/modulos/actividades/destino-provisional';

const postgresUrl = process.env.POSTGRES_URL_TEST;
const redisUrl = process.env.REDIS_URL_TEST;
const integracion = postgresUrl && redisUrl ? describe : describe.skip;

/** Solo bases de pruebas locales; nunca ejecuta DDL en la base compartida. */
integracion('CU10 HTTP + PostgreSQL + Redis reales', () => {
  const esquema = `cu10_${randomUUID().replaceAll('-', '')}`;
  const usuario = randomUUID();
  let db: Pool;
  let administrador: Pool;
  let redis: Redis;
  let servidor: Server;
  let url: string;
  let token: string;
  let deporteId: number;
  let sesiones: SesionesRepositorio;

  beforeAll(async () => {
    const pgDestino = new URL(postgresUrl!);
    const redisDestino = new URL(redisUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(pgDestino.hostname) ||
      pgDestino.pathname !== '/faltauno_test' ||
      !['localhost', '127.0.0.1'].includes(redisDestino.hostname)
    ) {
      throw new Error('Estas pruebas requieren PostgreSQL faltauno_test y Redis en localhost.');
    }
    administrador = new Pool({ connectionString: postgresUrl });
    await administrador.query('CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public');
    await administrador.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await administrador.query(`CREATE SCHEMA ${esquema}`);
    db = new Pool({ connectionString: postgresUrl, options: `-c search_path=${esquema},public`, max: 6 });
    await db.query(readFileSync(path.resolve(__dirname, '../../db/migrations/001_esquema_inicial.sql'), 'utf8'));
    await db.query(
      readFileSync(path.resolve(__dirname, '../../db/migrations/003_cu10_origen_opcional_destino_provisional.sql'), 'utf8'),
    );
    await db.query('INSERT INTO usuario (id,nombre,email,verificado) VALUES ($1,$2,$3,TRUE)', [
      usuario,
      'Prueba CU10',
      `${esquema}@test.invalid`,
    ]);
    const deporte = await db.query<{ id: number }>("INSERT INTO deporte (nombre) VALUES ('Surf') RETURNING id");
    deporteId = deporte.rows[0].id;
    redis = new Redis(redisUrl!);
    sesiones = new SesionesRepositorio(redis, 1);
    token = (await sesiones.crear(usuario)).token;
    jest.spyOn(GoogleMaps.prototype, 'resolver').mockResolvedValue(LUGAR_ACTIVIDAD);
    jest.spyOn(GoogleMaps.prototype, 'buscar').mockResolvedValue([{ placeId: 'origen-prueba', descripcion: 'Montevideo' }]);
    jest.spyOn(GoogleGeocoding.prototype, 'resolver').mockImplementation(async (punto) => ({ ...LUGAR_ACTIVIDAD, ...punto }));
    const config = leerConfig({
      NODE_ENV: 'test',
      POSTGRES_URL: postgresUrl,
      REDIS_URL: redisUrl,
      SESION_DIAS: '1',
      LOGIN_MAX_INTENTOS: '5',
      LOGIN_BLOQUEO_MINUTOS: '15',
      LIMITE_AUTH_SOLICITUDES: '100',
      LIMITE_AUTH_VENTANA_MINUTOS: '1',
      CORS_ORIGENES: 'http://localhost:5173',
      GOOGLE_MAPS_API_KEY: 'clave-falsa-exclusiva-de-prueba',
      ACTIVIDAD_DESTINO_PROVISIONAL_LAT: String(DESTINO_PROVISIONAL_PRUEBA.lat),
      ACTIVIDAD_DESTINO_PROVISIONAL_LNG: String(DESTINO_PROVISIONAL_PRUEBA.lng),
      ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO: DESTINO_PROVISIONAL_PRUEBA.departamento,
    });
    const app = crearApp({ config, db, redis, sesiones, logger, verificadorGoogle: new VerificadorGoogle([], logger) });
    servidor = await new Promise<Server>((resolve) => {
      const activo = app.listen(0, '127.0.0.1', () => resolve(activo));
    });
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/actividades`;
  }, 30000);

  afterAll(async () => {
    if (servidor) await new Promise<void>((resolve, reject) => servidor.close((error) => (error ? reject(error) : resolve())));
    if (redis) {
      await sesiones.cerrarTodas(usuario);
      const claves = await redis.keys(`cu10:${usuario}:*`);
      if (claves.length) await redis.del(...claves);
      await redis.quit();
    }
    if (db) await db.end();
    if (administrador) {
      await administrador.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
      await administrador.end();
    }
    jest.restoreAllMocks();
  });

  function datos(cambios: Record<string, unknown> = {}) {
    return { ...datosActividad(), deporteId, fechaHoraInicio: new Date(Date.now() + 86400000 * 2).toISOString(), ...cambios };
  }
  async function alta(clave: string, cuerpo = datos(), credencial = token) {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credencial}`, 'Idempotency-Key': clave },
      body: JSON.stringify(cuerpo),
    });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
  }

  it('FP/RNF-10: dos envíos concurrentes y una respuesta perdida dejan una sola actividad', async () => {
    const clave = randomUUID();
    const cuerpo = datos();
    const [primero, segundo] = await Promise.all([alta(clave, cuerpo), alta(clave, cuerpo)]);
    expect(primero.estado).toBe(201);
    expect(segundo.estado).toBe(201);
    expect(primero.cuerpo.id).toBe(segundo.cuerpo.id);
    const reintento = await alta(clave, cuerpo);
    expect(reintento.cuerpo).toEqual(primero.cuerpo);
    expect((await db.query('SELECT id FROM actividad WHERE id = $1', [primero.cuerpo.id])).rowCount).toBe(1);
    expect(
      (await db.query('SELECT id FROM participacion WHERE actividad_id = $1 AND es_organizador', [primero.cuerpo.id])).rowCount,
    ).toBe(1);
    expect((await db.query('SELECT nombre FROM invitado_externo')).rows).toContainEqual({ nombre: 'Ana' });
    const costo = await db.query('SELECT costo_estimado::text AS costo FROM actividad WHERE id = $1', [primero.cuerpo.id]);
    expect(costo.rows[0].costo).toBe('1200.50');
    expect((await alta(clave, { ...cuerpo, nombre: 'Otro contenido' })).estado).toBe(409);
  });
  it('E4/FP: guarda coordenadas provisionales exactas sin origen y el reintento conserva la marca', async () => {
    const disponibilidad = jest.spyOn(GoogleMaps.prototype, 'disponible').mockReturnValue(false);
    try {
      const clave = randomUUID();
      const cuerpo = datos({
        origenPlaceId: null,
        destinoPlaceId: DESTINO_PROVISIONAL_ID,
        tieneVehiculo: false,
        lugaresVehiculo: null,
      });
      const respuesta = await alta(clave, cuerpo);
      expect(respuesta.estado).toBe(201);
      expect(respuesta.cuerpo.destinoProvisional).toBe(true);
      expect(
        (
          await db.query(
            'SELECT origen_direccion, origen_lat, origen_lng, destino_lat::text, destino_lng::text, departamento, destino_provisional FROM actividad WHERE id = $1',
            [respuesta.cuerpo.id],
          )
        ).rows[0],
      ).toEqual({
        origen_direccion: null,
        origen_lat: null,
        origen_lng: null,
        destino_lat: '-34.47391234567891',
        destino_lng: '-57.84331234567891',
        departamento: 'Colonia',
        destino_provisional: true,
      });
      expect(
        (await db.query('SELECT punto_partida_direccion FROM participacion WHERE actividad_id = $1', [respuesta.cuerpo.id]))
          .rows[0].punto_partida_direccion,
      ).toBeNull();
      disponibilidad.mockReturnValue(true);
      expect((await alta(clave, cuerpo)).cuerpo).toEqual(respuesta.cuerpo);
    } finally {
      disponibilidad.mockRestore();
    }
  });

  it('ER1: fallo al guardar invitados revierte actividad y organizador; reintentar la misma clave funciona', async () => {
    await db.query(`CREATE FUNCTION rechazar_invitado() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.nombre = 'FALLAR' THEN RAISE EXCEPTION 'fallo de prueba'; END IF; RETURN NEW; END; $$`);
    await db.query(
      'CREATE TRIGGER fallo_cu10 BEFORE INSERT ON invitado_externo FOR EACH ROW EXECUTE FUNCTION rechazar_invitado()',
    );
    const clave = randomUUID();
    const cuerpo = datos({ nombre: 'Rollback CU10', invitados: ['FALLAR'] });
    expect((await alta(clave, cuerpo)).estado).toBe(500);
    expect((await db.query("SELECT id FROM actividad WHERE nombre = 'Rollback CU10'")).rowCount).toBe(0);
    await db.query('DROP TRIGGER fallo_cu10 ON invitado_externo');
    expect((await alta(clave, cuerpo)).estado).toBe(201);
  });

  it('E1/E2/E3: rechaza campos incompletos, fecha no futura y cupos excedidos', async () => {
    for (const cambios of [
      { descripcion: '' },
      { fechaHoraInicio: '2020-01-01T00:00:00Z' },
      { cupoMaximo: 21 },
      { cupoMaximo: 2, invitados: ['Ana', 'Luis'] },
    ]) {
      expect((await alta(randomUUID(), datos(cambios))).estado).toBe(400);
    }
  });

  it('E4: rechaza vehículo sin origen por HTTP y no crea una actividad', async () => {
    const antes = (await db.query('SELECT count(*)::integer AS cantidad FROM actividad')).rows[0].cantidad;
    const respuesta = await alta(randomUUID(), datos({ origenPlaceId: null }));
    expect(respuesta.estado).toBe(400);
    expect(respuesta.cuerpo).toMatchObject({ error: { campos: { origenPlaceId: expect.any(String) } } });
    expect((await db.query('SELECT count(*)::integer AS cantidad FROM actividad')).rows[0].cantidad).toBe(antes);
  });
  it('FP/E4: valida un pin y persiste las coordenadas elegidas como destino real', async () => {
    const origen = { lat: -34.9055, lng: -56.1913 };
    const destino = { lat: -34.91635775362398, lng: -56.11543161770436 };
    const consulta = await fetch(
      `${url}/ubicaciones/punto?${new URLSearchParams({ lat: String(destino.lat), lng: String(destino.lng) })}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(consulta.status).toBe(200);
    expect(await consulta.json()).toMatchObject(destino);
    const cuerpo = datos({ origenPlaceId: null, destinoPlaceId: null, origenCoordenadas: origen, destinoCoordenadas: destino });
    const clave = randomUUID();
    const respuesta = await alta(clave, cuerpo);
    expect(respuesta.estado).toBe(201);
    expect(respuesta.cuerpo.destinoProvisional).toBe(false);
    expect(
      (
        await db.query(
          'SELECT origen_lat::text, origen_lng::text, destino_lat::text, destino_lng::text, destino_provisional FROM actividad WHERE id = $1',
          [respuesta.cuerpo.id],
        )
      ).rows[0],
    ).toEqual({
      origen_lat: '-34.905500',
      origen_lng: '-56.191300',
      destino_lat: '-34.91635775362398',
      destino_lng: '-56.11543161770436',
      destino_provisional: false,
    });
    expect((await alta(clave, cuerpo)).cuerpo).toEqual(respuesta.cuerpo);
    const invalida = await fetch(`${url}/ubicaciones/punto?lat=91&lng=-56`, { headers: { Authorization: `Bearer ${token}` } });
    expect(invalida.status).toBe(400);
  });

  it('ER3: no admite una sesión inválida ni una cuenta inactiva', async () => {
    expect((await alta(randomUUID(), datos(), 'token-invalido')).estado).toBe(401);
    await db.query('UPDATE usuario SET verificado = FALSE WHERE id = $1', [usuario]);
    try {
      expect((await alta(randomUUID())).estado).toBe(401);
    } finally {
      await db.query('UPDATE usuario SET verificado = TRUE WHERE id = $1', [usuario]);
    }
  });

  it('FP/E5/RNF-10: opciones, ubicación y preflight CORS son accesibles con sesión', async () => {
    const respuesta = await fetch(`${url}/opciones`, { headers: { Authorization: `Bearer ${token}` } });
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({
      maximoParticipantes: 20,
      mapasDisponibles: true,
      destinoPorDefecto: {
        placeId: DESTINO_PROVISIONAL_ID,
        lat: DESTINO_PROVISIONAL_PRUEBA.lat,
        lng: DESTINO_PROVISIONAL_PRUEBA.lng,
        provisional: true,
      },
      pronostico: { disponible: false },
    });
    const ubicacion = await fetch(`${url}/ubicaciones?texto=Montevideo&sesion=${randomUUID()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(await ubicacion.json()).toEqual([{ placeId: 'origen-prueba', descripcion: 'Montevideo' }]);
    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Headers': 'Idempotency-Key' },
    });
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Idempotency-Key');
  });
});
