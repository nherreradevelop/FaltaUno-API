/** Entorno temporal de revisión visual. Solo faltauno_test local; se limpia al detenerlo. */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Observable } from '../src/comun/observable';
import type { EventoGasto } from '../src/modulos/gastos/gastos.eventos';
import type { EventoPago } from '../src/modulos/pagos/pagos.eventos';
import { TiempoReal } from '../src/infra/tiempo-real';
import { conectarActualizacionesFinancieras } from '../src/suscripciones';
import { FinanzasTiempoRealObservador } from '../src/modulos/gastos/finanzas-tiempo-real.observador';
import { FinanzasTiempoRealRepositorio } from '../src/modulos/gastos/finanzas-tiempo-real.repositorio';
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
import { SesionesRepositorio } from '../src/modulos/auth/sesiones.repositorio';
import type { NotificacionesServicio } from '../src/modulos/notificaciones/notificaciones.servicio';
import { GastosRepositorio } from '../src/modulos/gastos/gastos.repositorio';
import { GastosServicio } from '../src/modulos/gastos/gastos.servicio';
import { enTransaccion } from '../src/infra/postgres';

async function iniciar() {
  const esquema = `gastos_visual_${randomUUID().replaceAll('-', '')}`;
  const postgres = 'postgres://faltauno:faltauno_dev@127.0.0.1:5432/faltauno_test';
  const admin = new Pool({ connectionString: postgres });
  await admin.query(`CREATE SCHEMA ${esquema}`);
  const db = new Pool({ connectionString: postgres, options: `-c search_path=${esquema},public` });
  for (const nombre of [
    '001_esquema_inicial.sql',
    '004_cu10_origen_opcional_destino_provisional.sql',
    '005_cu23_cu24_cu25_gastos.sql',
    '006_notificaciones_gastos.sql',
    '007_cu26_pagos.sql',
  ])
    await db.query(readFileSync(path.resolve(__dirname, '../../db/migrations', nombre), 'utf8'));
  const [usuario, otro, actividad, participacion, participacionOtro, invitado] = Array.from({ length: 6 }, () => randomUUID());
  const hash = await bcrypt.hash('GastosPrueba123!', 4);
  await db.query(
    "INSERT INTO usuario(id,nombre,email,password_hash,verificado) VALUES($1,'Ana Prueba','gastos@test.invalid',$3,true),($2,'Bruno Prueba','bruno@test.invalid',$3,true)",
    [usuario, otro, hash],
  );
  await db.query("INSERT INTO deporte(id,nombre) VALUES(1,'Surf')");
  await db.query(
    `INSERT INTO actividad(id,organizador_id,deporte_id,nombre,descripcion,fecha_hora_inicio,cupo_maximo,nivel,destino_direccion,destino_lat,destino_lng,departamento,estado)
    VALUES($1,$2,1,'Salida de prueba de gastos','Actividad de prueba local',now()-interval '1 day',5,'principiante','Playa Pocitos',-34.9,-56.2,'Montevideo','iniciada')`,
    [actividad, usuario],
  );
  await db.query('INSERT INTO participacion(id,actividad_id,usuario_id,es_organizador) VALUES($1,$3,$4,true),($2,$3,$5,false)', [
    participacion,
    participacionOtro,
    actividad,
    usuario,
    otro,
  ]);
  await db.query("INSERT INTO invitado_externo(id,participacion_id,nombre) VALUES($1,$2,'Camila Invitada')", [
    invitado,
    participacion,
  ]);
  await new GastosServicio({
    repositorio: new GastosRepositorio(db),
    transaccion: (operacion) => enTransaccion(db, (tx) => operacion(new GastosRepositorio(tx))),
    alFallarAuditoria: () => undefined,
  }).ejecutar(usuario, actividad, randomUUID(), 'registrar', {
    concepto: 'Combustible de prueba',
    montoCentesimos: 120000,
    pagadorId: `p:${participacion}`,
    participantes: [`p:${participacionOtro}`],
  });
  const redis = new Redis('redis://127.0.0.1:6379/15');
  const sesiones = new SesionesRepositorio(redis, 1);
  const config = leerConfig({
    POSTGRES_URL: postgres,
    REDIS_URL: 'redis://127.0.0.1:6379/15',
    MONGO_URL: 'mongodb://localhost:27018',
    SESION_DIAS: '1',
    LOGIN_MAX_INTENTOS: '5',
    LOGIN_BLOQUEO_MINUTOS: '15',
    LIMITE_AUTH_SOLICITUDES: '100',
    LIMITE_AUTH_VENTANA_MINUTOS: '1',
    CORS_ORIGENES: 'http://localhost:5174,http://localhost:5175',
    ACTIVIDAD_DESTINO_PROVISIONAL_LAT: '-34.9',
    ACTIVIDAD_DESTINO_PROVISIONAL_LNG: '-56.2',
    ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO: 'Montevideo',
  });
  const app = express();
  const eventosGastos = new Observable<EventoGasto>((error) => logger.error({ err: error }, 'Observador de prueba'));
  const eventosPagos = new Observable<EventoPago>((error) => logger.error({ err: error }, 'Observador de prueba'));
  let perderRespuesta = false;
  app.post('/prueba/perder-respuesta', (_req, res) => {
    perderRespuesta = true;
    res.sendStatus(204);
  });
  app.use((req, res, next) => {
    if (perderRespuesta && req.method === 'POST' && (req.path.endsWith('/gastos') || req.path.endsWith('/pagos'))) {
      perderRespuesta = false;
      const json = res.json.bind(res);
      res.json = ((cuerpo: unknown) => {
        if (res.statusCode < 400) {
          res.status(503);
          return json({ error: { codigo: 'RESPUESTA_PERDIDA_PRUEBA', mensaje: 'Confirmación perdida en la prueba local.' } });
        }
        return json(cuerpo);
      }) as typeof res.json;
    }
    next();
  });
  app.use(
    crearApp({
      config,
      db,
      redis,
      mongo: {} as Db,
      sesiones,
      eventosGastos,
      eventosPagos,
      logger,
      verificadorGoogle: new VerificadorGoogle([], logger),
      notificaciones: { contarNoLeidas: async () => ({ cantidad: 0 }) } as unknown as NotificacionesServicio,
    }),
  );
  const servidor = createServer(app);
  const tiempoReal = TiempoReal.iniciar(servidor, { origenes: config.CORS_ORIGENES, sesiones, logger });
  const desconectarFinanzas = conectarActualizacionesFinancieras(
    eventosGastos,
    eventosPagos,
    new FinanzasTiempoRealObservador(new FinanzasTiempoRealRepositorio(db), tiempoReal),
  );
  servidor.listen(3001, '0.0.0.0', () =>
    console.log(JSON.stringify({ url: `http://localhost:5175/actividades/${actividad}`, esquema })),
  );
  let cerrando = false;
  async function cerrar() {
    if (cerrando) return;
    cerrando = true;
    desconectarFinanzas();
    servidor.close();
    await sesiones.cerrarTodas(usuario);
    await sesiones.cerrarTodas(otro);
    await redis.quit();
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
    await admin.end();
    process.exit(0);
  }
  process.once('SIGINT', () => void cerrar());
  process.once('SIGTERM', () => void cerrar());
}
void iniciar();
