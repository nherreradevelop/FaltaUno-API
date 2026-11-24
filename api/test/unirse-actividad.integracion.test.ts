import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import Redis from 'ioredis';
import type { Db } from 'mongodb';
import { Pool } from 'pg';
import { crearApp } from '../src/app';
import { leerConfig } from '../src/config/env';
import { logger } from '../src/infra/logger';
import { VerificadorGoogle } from '../src/infra/oauth';
import { crearEventosDeActividades, type ParticipanteUnido } from '../src/modulos/actividades/actividades.eventos';
import { ActividadesRepositorio } from '../src/modulos/actividades/actividades.repositorio';
import { SesionesRepositorio } from '../src/modulos/auth/sesiones.repositorio';
import type { NotificacionesServicio } from '../src/modulos/notificaciones/notificaciones.servicio';

const postgresUrl = process.env.POSTGRES_URL_TEST;
const redisUrl = process.env.REDIS_URL_TEST;
const integracion = postgresUrl && redisUrl ? describe : describe.skip;

/** Solo bases de pruebas locales; nunca ejecuta DDL en la base compartida. */
integracion('CU11 HTTP + PostgreSQL + Redis reales', () => {
  const esquema = `cu11_${randomUUID().replaceAll('-', '')}`;
  const organizador = randomUUID();
  const usuarios = [randomUUID(), randomUUID(), randomUUID()];
  const tokens: string[] = [];
  const eventosRecibidos: ParticipanteUnido[] = [];
  let db: Pool;
  let administrador: Pool;
  let redis: Redis;
  let sesiones: SesionesRepositorio;
  let servidor: Server;
  let url: string;
  let deporteId: number;

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
      readFileSync(path.resolve(__dirname, '../../db/migrations/004_cu10_origen_opcional_destino_provisional.sql'), 'utf8'),
    );
    for (const [indice, id] of [organizador, ...usuarios].entries()) {
      await db.query('INSERT INTO usuario (id, nombre, email, verificado) VALUES ($1, $2, $3, TRUE)', [
        id,
        `Prueba CU11 ${indice}`,
        `${esquema}_${indice}@test.invalid`,
      ]);
    }
    deporteId = (await db.query<{ id: number }>("INSERT INTO deporte (nombre) VALUES ('Surf') RETURNING id")).rows[0].id;

    redis = new Redis(redisUrl!);
    sesiones = new SesionesRepositorio(redis, 1);
    for (const id of usuarios) {
      tokens.push((await sesiones.crear(id)).token);
    }
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
      ACTIVIDAD_DESTINO_PROVISIONAL_LAT: '-34.47',
      ACTIVIDAD_DESTINO_PROVISIONAL_LNG: '-57.84',
      ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO: 'Colonia',
      MONGO_URL: 'mongodb://localhost:27017',
    });
    const eventosActividades = crearEventosDeActividades(logger);
    eventosActividades.participanteUnido.suscribir((evento) => {
      eventosRecibidos.push(evento);
    });
    const app = crearApp({
      config,
      db,
      redis,
      // El aviso al organizador (CU40) se prueba aparte: acá no se levanta MongoDB
      mongo: {} as Db,
      sesiones,
      logger,
      verificadorGoogle: new VerificadorGoogle([], logger),
      notificaciones: {} as NotificacionesServicio,
      eventosActividades,
    });
    servidor = await new Promise<Server>((resolve) => {
      const activo = app.listen(0, '127.0.0.1', () => resolve(activo));
    });
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/actividades`;
  }, 30000);

  afterAll(async () => {
    if (servidor) await new Promise<void>((resolve, reject) => servidor.close((error) => (error ? reject(error) : resolve())));
    if (redis) {
      for (const id of usuarios) await sesiones.cerrarTodas(id);
      await redis.quit();
    }
    if (db) await db.end();
    if (administrador) {
      await administrador.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
      await administrador.end();
    }
  });

  /** Actividad programada para pasado mañana, con el organizador ya anotado (CU10 paso 10, RN6). */
  async function crearActividad(cupoMaximo: number): Promise<string> {
    const actividad = await db.query<{ id: string }>(
      `INSERT INTO actividad (organizador_id, deporte_id, nombre, fecha_hora_inicio, cupo_maximo, nivel,
         destino_direccion, destino_lat, destino_lng, departamento)
       VALUES ($1, $2, 'Surf CU11', now() + interval '2 days', $3, 'intermedio', 'Playa', -34.6, -54.1, 'Rocha')
       RETURNING id`,
      [organizador, deporteId, cupoMaximo],
    );
    const id = actividad.rows[0].id;
    await db.query('INSERT INTO participacion (actividad_id, usuario_id, es_organizador) VALUES ($1, $2, TRUE)', [
      id,
      organizador,
    ]);
    return id;
  }

  async function unirse(actividadId: string, token: string, invitados: string[] = []) {
    const respuesta = await fetch(`${url}/${actividadId}/participantes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tieneVehiculo: false, lugaresVehiculo: null, invitados }),
    });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
  }

  async function cuposOcupados(actividadId: string): Promise<number> {
    const resultado = await db.query<{ ocupados: number }>(
      `SELECT (SELECT count(*)::int FROM participacion WHERE actividad_id = $1)
            + (SELECT count(*)::int FROM invitado_externo ie JOIN participacion p ON p.id = ie.participacion_id
               WHERE p.actividad_id = $1) AS ocupados`,
      [actividadId],
    );
    return resultado.rows[0].ocupados;
  }

  it('FP: guarda la participación con sus invitados y responde los cupos actualizados', async () => {
    const actividadId = await crearActividad(5);
    const respuesta = await unirse(actividadId, tokens[0], ['Ana', 'Luis']);
    expect(respuesta).toEqual({
      estado: 201,
      cuerpo: { actividadId, cupoMaximo: 5, cuposOcupados: 4, cuposLibres: 1 },
    });
    expect(await cuposOcupados(actividadId)).toBe(4);
    expect(eventosRecibidos).toContainEqual({
      actividadId,
      usuarioId: usuarios[0],
      organizadorId: organizador,
      cantidadInvitados: 2,
    });
  });

  it('RN8/RNF-14: tres usuarios a la vez por el último lugar → entra uno solo y el cupo no se excede', async () => {
    const actividadId = await crearActividad(2); // el organizador ocupa un lugar: queda uno
    const respuestas = await Promise.all(tokens.map((token) => unirse(actividadId, token)));
    const estados = respuestas.map((respuesta) => respuesta.estado).sort();
    expect(estados).toEqual([201, 409, 409]);
    expect(await cuposOcupados(actividadId)).toBe(2);
  });

  it('RN2: el mismo usuario dos veces a la vez → una sola participación y YA_PARTICIPA', async () => {
    const actividadId = await crearActividad(6);
    const [primera, segunda] = await Promise.all([unirse(actividadId, tokens[1]), unirse(actividadId, tokens[1])]);
    expect([primera.estado, segunda.estado].sort()).toEqual([201, 409]);
    const rechazo = primera.estado === 409 ? primera : segunda;
    expect(rechazo.cuerpo).toMatchObject({ error: { codigo: 'YA_PARTICIPA' } });
    expect(await cuposOcupados(actividadId)).toBe(2);
  });

  it('E3: actividad cancelada → 409 y no cambia nada', async () => {
    const actividadId = await crearActividad(6);
    await db.query("UPDATE actividad SET estado = 'cancelada' WHERE id = $1", [actividadId]);
    expect((await unirse(actividadId, tokens[2])).cuerpo).toMatchObject({ error: { codigo: 'ACTIVIDAD_CANCELADA' } });
    expect(await cuposOcupados(actividadId)).toBe(1);
  });

  it('ER1: si falla el registro de un invitado, se revierte también la participación', async () => {
    const actividadId = await crearActividad(6);
    await db.query(`CREATE FUNCTION rechazar_invitado_cu11() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.nombre = 'FALLAR' THEN RAISE EXCEPTION 'fallo de prueba'; END IF; RETURN NEW; END; $$`);
    await db.query(
      'CREATE TRIGGER fallo_cu11 BEFORE INSERT ON invitado_externo FOR EACH ROW EXECUTE FUNCTION rechazar_invitado_cu11()',
    );
    try {
      expect((await unirse(actividadId, tokens[2], ['FALLAR'])).estado).toBe(500);
      expect(await cuposOcupados(actividadId)).toBe(1);
      expect(eventosRecibidos.some((evento) => evento.actividadId === actividadId)).toBe(false);
    } finally {
      await db.query('DROP TRIGGER fallo_cu11 ON invitado_externo');
    }
    // El usuario puede intentar nuevamente
    expect((await unirse(actividadId, tokens[2], ['Ana'])).estado).toBe(201);
  });

  it('CU09 A1: el punto de partida lo ven quienes forman parte; quien no participa recibe null', async () => {
    const actividadId = await crearActividad(6);
    expect((await unirse(actividadId, tokens[0])).estado).toBe(201);
    await db.query(
      `UPDATE participacion SET punto_partida_direccion = 'Tres Cruces', punto_partida_lat = -34.894, punto_partida_lng = -56.166
       WHERE actividad_id = $1 AND usuario_id = $2`,
      [actividadId, usuarios[0]],
    );

    async function puntoDelParticipante(token: string) {
      const respuesta = await fetch(`${url}/${actividadId}/participantes`, { headers: { Authorization: `Bearer ${token}` } });
      const cuerpo = (await respuesta.json()) as {
        participantes: { usuario: { id: string } | null; puntoPartida: unknown }[];
      };
      return cuerpo.participantes.find((participante) => participante.usuario?.id === usuarios[0])?.puntoPartida;
    }

    expect(await puntoDelParticipante(tokens[0])).toEqual({ direccion: 'Tres Cruces', lat: -34.894, lng: -56.166 });
    expect(await puntoDelParticipante(tokens[2])).toBeNull();
    // CU33: una participación cuya cuenta se cerró no expone el punto de partida
    await db.query(
      `UPDATE participacion SET usuario_id = NULL, punto_partida_direccion = 'Casa', punto_partida_lat = -34.9, punto_partida_lng = -56.1
       WHERE actividad_id = $1 AND es_organizador`,
      [actividadId],
    );
    const respuesta = await fetch(`${url}/${actividadId}/participantes`, { headers: { Authorization: `Bearer ${tokens[0]}` } });
    const cuerpo = (await respuesta.json()) as { participantes: { usuario: unknown; puntoPartida: unknown }[] };
    const cuentaCerrada = cuerpo.participantes.find((participante) => participante.usuario === null);
    expect(cuentaCerrada?.puntoPartida).toBeNull();
  });

  it('paso 9 / RN14: el aviso obtiene los nombres y si el organizador silenció la actividad', async () => {
    const actividadId = await crearActividad(6);
    const repositorio = new ActividadesRepositorio(db);
    expect(await repositorio.buscarDatosDelAviso(actividadId, usuarios[1])).toEqual({
      nombreActividad: 'Surf CU11',
      nombreParticipante: 'Prueba CU11 2',
      organizadorSilencio: false,
    });
    await db.query('UPDATE participacion SET silenciada = TRUE WHERE actividad_id = $1 AND es_organizador', [actividadId]);
    expect(await repositorio.buscarDatosDelAviso(actividadId, usuarios[1])).toMatchObject({ organizadorSilencio: true });
    expect(await repositorio.buscarDatosDelAviso(randomUUID(), usuarios[1])).toBeNull();
  });

  it('ER2: sin sesión → 401 SESION_INVALIDA', async () => {
    const actividadId = await crearActividad(6);
    expect((await unirse(actividadId, 'token-vencido')).cuerpo).toMatchObject({ error: { codigo: 'SESION_INVALIDA' } });
  });
});
