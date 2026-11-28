/** CU42: entorno de evidencia exclusivamente sobre faltauno_test local, con controles de fallas. */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import Redis from 'ioredis';
import type { Db } from 'mongodb';
import { crearApp } from '../src/app';
import { leerConfig } from '../src/config/env';
import { logger } from '../src/infra/logger';
import { VerificadorGoogle } from '../src/infra/oauth';
import { crearEventosDeActividades } from '../src/modulos/actividades/actividades.eventos';
import { SesionesRepositorio } from '../src/modulos/auth/sesiones.repositorio';
import type { NotificacionesServicio } from '../src/modulos/notificaciones/notificaciones.servicio';

async function iniciar() {
  const postgres = 'postgres://faltauno:faltauno_dev@127.0.0.1:5432/faltauno_test';
  const admin = new Pool({ connectionString: postgres });
  const esquema = `cu42_visual_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${esquema}`);
  const db = new Pool({ connectionString: postgres, options: `-c search_path=${esquema},public` });
  for (const nombre of [
    '001_esquema_inicial.sql',
    '003_indice_participacion_actividad.sql',
    '004_cu10_origen_opcional_destino_provisional.sql',
    '005_cu23_cu24_cu25_gastos.sql',
    '006_notificaciones_gastos.sql',
    '007_cu26_pagos.sql',
  ]) {
    await db.query(readFileSync(path.resolve(__dirname, '../../db/migrations', nombre), 'utf8'));
  }
  const usuario = '00000000-0000-4000-8000-000000000001';
  const otro = '00000000-0000-4000-8000-000000000002';
  const hash = await bcrypt.hash('FaltaUno123!', 4);
  await db.query(
    `INSERT INTO usuario(id,nombre,email,password_hash,verificado) VALUES
    ($1,'Elian Prueba CU42','armanelian@gmail.com',$3,true),($2,'Otro participante CU42','otro-cu42@test.invalid',$3,true)`,
    [usuario, otro, hash],
  );
  await db.query("INSERT INTO deporte(id,nombre) VALUES(1,'Trekking')");
  const propias: string[] = [];
  const nombres = [
    'Actividad de hoy CU42',
    ...Array.from({ length: 11 }, (_, i) => `Salida anterior ${String(i + 1).padStart(2, '0')}`),
  ];
  for (let i = 0; i < 16; i++) {
    const id = randomUUID();
    const estado = i < 13 ? 'iniciada' : ['programada', 'archivada', 'cancelada'][i - 13];
    const nombre =
      i < 12 ? nombres[i] : ['Iniciada de hoy ajena', 'Programada de hoy', 'Archivada de hoy', 'Cancelada de hoy'][i - 12];
    const organizador = i % 2 === 0 ? usuario : otro;
    const horas = i < 12 ? -24 * i : 0;
    await db.query(
      `INSERT INTO actividad(id,nombre,descripcion,organizador_id,deporte_id,fecha_hora_inicio,cupo_maximo,nivel,
      origen_direccion,origen_lat,origen_lng,destino_direccion,destino_lat,destino_lng,departamento,estado)
      VALUES($1,$2,'Datos sintéticos de testing CU42',$3,1,now()+$4*interval '1 hour',6,'principiante',
      'Montevideo',-34.9,-56.2,'Parque de prueba',-34.6,-55.1,'Lavalleja',$5)`,
      [id, nombre, i === 12 ? otro : organizador, horas, estado],
    );
    const org = i === 12 ? otro : organizador;
    await db.query('INSERT INTO participacion(actividad_id,usuario_id,es_organizador) VALUES($1,$2,true)', [id, org]);
    if (i !== 12 && org !== usuario)
      await db.query('INSERT INTO participacion(actividad_id,usuario_id) VALUES($1,$2)', [id, usuario]);
    if (i < 12) propias.push(id);
  }
  const redis = new Redis('redis://127.0.0.1:6379/14');
  const sesiones = new SesionesRepositorio(redis, 1);
  const config = leerConfig({
    NODE_ENV: 'test',
    POSTGRES_URL: postgres,
    REDIS_URL: 'redis://127.0.0.1:6379/14',
    MONGO_URL: 'mongodb://localhost:27017',
    SESION_DIAS: '1',
    LOGIN_MAX_INTENTOS: '100',
    LOGIN_BLOQUEO_MINUTOS: '1',
    LIMITE_AUTH_SOLICITUDES: '1000',
    LIMITE_AUTH_VENTANA_MINUTOS: '1',
    CORS_ORIGENES: 'http://localhost:5176,http://127.0.0.1:5176',
    ACTIVIDAD_DESTINO_PROVISIONAL_LAT: '-34.9',
    ACTIVIDAD_DESTINO_PROVISIONAL_LNG: '-56.2',
    ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO: 'Montevideo',
  });
  let modo = 'normal';
  const app = express();
  app.use(express.json());
  app.post('/prueba/escenario/:modo', async (req, res) => {
    modo = String(req.params.modo);
    await db.query('UPDATE actividad SET estado=$2 WHERE id=ANY($1::uuid[])', [
      propias,
      modo === 'vacio' ? 'archivada' : 'iniciada',
    ]);
    res.json({ modo });
  });
  app.get('/prueba/datos', (_req, res) => res.json({ esquema, usuario, propias, modo }));
  app.use((req, res, next) => {
    if (req.path === '/api/actividades/iniciadas') {
      if (modo === 'error' || (modo === 'error-pagina-2' && req.query.pagina === '2')) {
        res.status(503).json({ error: { codigo: 'FALLA_CONTROLADA_CU42', mensaje: 'Falla controlada de testing.' } });
        return;
      }
      if (modo === 'invalido') {
        res.json({ actividades: [{}], pagina: 1, hayMas: false });
        return;
      }
      if (modo === 'sesion') {
        res.status(401).json({ error: { codigo: 'SESION_INVALIDA', mensaje: 'Tu sesión venció. Iniciá sesión de nuevo.' } });
        return;
      }
    }
    next();
  });
  const notificaciones = {
    listar: async () => ({ notificaciones: [], hayMas: false }),
    contarNoLeidas: async () => ({ cantidad: 0 }),
  } as unknown as NotificacionesServicio;
  app.use(
    crearApp({
      config,
      db,
      redis,
      mongo: {} as Db,
      sesiones,
      logger,
      verificadorGoogle: new VerificadorGoogle([], logger),
      notificaciones,
      eventosActividades: crearEventosDeActividades(logger),
    }),
  );
  const servidor = app.listen(3002, '0.0.0.0', () =>
    console.log(JSON.stringify({ cu42: 'listo', puerto: 3002, esquema, usuario })),
  );
  async function cerrar() {
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
    await sesiones.cerrarTodas(usuario);
    await redis.quit();
    await db.end();
    await admin.query(`DROP SCHEMA ${esquema} CASCADE`);
    await admin.end();
    process.exit(0);
  }
  process.once('SIGTERM', () => void cerrar());
  process.once('SIGINT', () => void cerrar());
}
void iniciar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
