import { PagosRepositorio } from '../src/modulos/pagos/pagos.repositorio';
import { PagosServicio } from '../src/modulos/pagos/pagos.servicio';
import { PagosRetencionRepositorio } from '../src/modulos/pagos/pagos-retencion.repositorio';
import type { PagoDto, OpcionesPago } from '../src/modulos/pagos/pagos.dto';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import Redis from 'ioredis';
import type { Db } from 'mongodb';
import { crearApp } from '../src/app';
import { leerConfig } from '../src/config/env';
import { logger } from '../src/infra/logger';
import { enTransaccion } from '../src/infra/postgres';
import { VerificadorGoogle } from '../src/infra/oauth';
import { SesionesRepositorio } from '../src/modulos/auth/sesiones.repositorio';
import type { NotificacionesServicio } from '../src/modulos/notificaciones/notificaciones.servicio';
import { GastosRepositorio } from '../src/modulos/gastos/gastos.repositorio';
import { GastosServicio } from '../src/modulos/gastos/gastos.servicio';
import type { DatosGasto, GastoDto } from '../src/modulos/gastos/gastos.dto';
import { createServer } from 'node:http';
import { Observable } from '../src/comun/observable';
import type { EventoGasto } from '../src/modulos/gastos/gastos.eventos';
import type { EventoPago } from '../src/modulos/pagos/pagos.eventos';
import { TiempoReal } from '../src/infra/tiempo-real';
import { FinanzasTiempoRealObservador } from '../src/modulos/gastos/finanzas-tiempo-real.observador';
import { FinanzasTiempoRealRepositorio } from '../src/modulos/gastos/finanzas-tiempo-real.repositorio';
import { conectarActualizacionesFinancieras } from '../src/suscripciones';

const destino = process.env.POSTGRES_URL_TEST;
const redisDestino = process.env.REDIS_URL_TEST;
const integracion = destino && redisDestino ? describe : describe.skip;
integracion('CU26 pagos HTTP/SQL reales y retención', () => {
  const esquema = `pagos_${randomUUID().replaceAll('-', '')}`;
  const [usuarioA, usuarioB, usuarioAjeno, actividad, participacionA, participacionB, invitado] = Array.from({ length: 7 }, () =>
    randomUUID(),
  );
  let admin: Pool;
  let db: Pool;
  let redis: Redis;
  let servicio: GastosServicio;
  let repo: GastosRepositorio;
  let pagos: PagosServicio;
  let servidor: Server;
  let url: string;
  let tokenA: string;
  let tokenB: string;
  let tokenAjeno: string;
  let sesiones: SesionesRepositorio;
  const notificar = jest.fn();
  const notificarPago = jest.fn();
  const datos = (cambios: Partial<DatosGasto> = {}): DatosGasto => ({
    concepto: 'Combustible',
    montoCentesimos: 300,
    pagadorId: `p:${participacionA}`,
    participantes: [`p:${participacionB}`],
    ...cambios,
  });
  const crear = (cambios: Partial<DatosGasto> = {}, clave = randomUUID()) =>
    servicio.ejecutar(usuarioA, actividad, clave, 'registrar', datos(cambios));
  beforeAll(async () => {
    const pg = new URL(destino!);
    const r = new URL(redisDestino!);
    if (
      !['localhost', '127.0.0.1'].includes(pg.hostname) ||
      pg.pathname !== '/faltauno_test' ||
      !['localhost', '127.0.0.1'].includes(r.hostname) ||
      r.pathname !== '/15'
    )
      throw new Error('Las pruebas de gastos requieren faltauno_test y Redis /15 locales.');
    admin = new Pool({ connectionString: destino });
    await admin.query('CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public');
    await admin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await admin.query(`CREATE SCHEMA ${esquema}`);
    db = new Pool({ connectionString: destino, options: `-c search_path=${esquema},public`, max: 8 });
    for (const archivo of [
      '001_esquema_inicial.sql',
      '004_cu10_origen_opcional_destino_provisional.sql',
      '005_cu23_cu24_cu25_gastos.sql',
      '006_notificaciones_gastos.sql',
      '007_cu26_pagos.sql',
    ])
      await db.query(readFileSync(path.resolve(__dirname, '../../db/migrations', archivo), 'utf8'));
    await db.query(
      `INSERT INTO usuario(id,nombre,email,verificado) VALUES($1,'Ana',$4,true),($2,'Bruno',$5,true),($3,'Ajeno',$6,true)`,
      [usuarioA, usuarioB, usuarioAjeno, ...[usuarioA, usuarioB, usuarioAjeno].map((id) => `${id}@test.invalid`)],
    );
    await db.query("INSERT INTO deporte(id,nombre) VALUES(1,'Surf')");
    repo = new GastosRepositorio(db);
    servicio = new GastosServicio({
      repositorio: repo,
      transaccion: (operacion) => enTransaccion(db, (tx) => operacion(new GastosRepositorio(tx))),
      eventos: { notificar },
      alFallarAuditoria: () => undefined,
    });
    pagos = new PagosServicio({
      eventos: { notificar: notificarPago },
      repositorio: new PagosRepositorio(db),
      transaccion: (operacion) => enTransaccion(db, (tx) => operacion(new PagosRepositorio(tx))),
      alFallarAuditoria: () => undefined,
    });
    redis = new Redis(redisDestino!);
    sesiones = new SesionesRepositorio(redis, 1);
    [tokenA, tokenB, tokenAjeno] = await Promise.all(
      [usuarioA, usuarioB, usuarioAjeno].map(async (id) => (await sesiones.crear(id)).token),
    );
    const config = leerConfig({
      POSTGRES_URL: destino,
      REDIS_URL: redisDestino,
      MONGO_URL: 'mongodb://localhost:27018',
      SESION_DIAS: '1',
      LOGIN_MAX_INTENTOS: '5',
      LOGIN_BLOQUEO_MINUTOS: '15',
      LIMITE_AUTH_SOLICITUDES: '100',
      LIMITE_AUTH_VENTANA_MINUTOS: '1',
      ACTIVIDAD_DESTINO_PROVISIONAL_LAT: '-34.9',
      ACTIVIDAD_DESTINO_PROVISIONAL_LNG: '-56.2',
      ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO: 'Montevideo',
    });
    servidor = await new Promise<Server>((resolve) => {
      const s = crearApp({
        config,
        db,
        redis,
        mongo: {} as Db,
        sesiones,
        logger,
        verificadorGoogle: new VerificadorGoogle([], logger),
        notificaciones: {} as NotificacionesServicio,
      }).listen(0, '127.0.0.1', () => resolve(s));
    });
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/actividades/${actividad}`;
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    notificar.mockClear();
    notificarPago.mockClear();
    await db.query('TRUNCATE actividad CASCADE');
    await db.query(
      `INSERT INTO actividad(id,organizador_id,deporte_id,nombre,fecha_hora_inicio,cupo_maximo,nivel,destino_direccion,destino_lat,destino_lng,departamento,estado)
      VALUES($1,$2,1,'Actividad de prueba',now()-interval '2 days',5,'principiante','Montevideo',-34.9,-56.2,'Montevideo','iniciada')`,
      [actividad, usuarioA],
    );
    await db.query(
      'INSERT INTO participacion(id,actividad_id,usuario_id,es_organizador) VALUES($1,$3,$4,true),($2,$3,$5,false)',
      [participacionA, participacionB, actividad, usuarioA, usuarioB],
    );
    await db.query("INSERT INTO invitado_externo(id,participacion_id,nombre) VALUES($1,$2,'Invitada')", [
      invitado,
      participacionA,
    ]);
    await crear();
  });
  afterAll(async () => {
    if (servidor) await new Promise<void>((resolve, reject) => servidor.close((e) => (e ? reject(e) : resolve())));
    if (redis) {
      for (const token of [tokenA, tokenB, tokenAjeno]) if (token) await sesiones.cerrar(token);
      await redis.quit();
    }
    if (db) await db.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
      await admin.end();
    }
  });
  async function http(ruta: string, metodo = 'GET', cuerpo?: unknown, token = tokenA, clave = randomUUID()) {
    const respuesta = await fetch(url + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': clave },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return {
      estado: respuesta.status,
      cuerpo: (await respuesta.json()) as {
        pago: PagoDto;
        pagos: PagoDto[];
        opciones: OpcionesPago;
        error: { codigo: string; campos?: Record<string, string> };
      },
    };
  }

  const datosPago = (montoCentesimos: unknown = 100) => ({
    pagadorId: participacionB,
    receptorId: participacionA,
    montoCentesimos,
  });
  const pagar = (monto = 100, clave = randomUUID(), usuario = usuarioB) =>
    pagos.ejecutar(usuario, actividad, clave, 'registrar', datosPago(monto));

  it('emite pagos solo tras confirmar cambios: omite reenvíos, ediciones iguales y rollbacks', async () => {
    const clave = randomUUID();
    const creado = await pagar(100, clave);
    expect(notificarPago).toHaveBeenLastCalledWith({
      tipo: 'pagoRegistrado',
      actividadId: actividad,
      pagoId: creado.pago.id,
      usuarioId: usuarioB,
    });
    await pagar(100, clave);
    await pagos.ejecutar(usuarioB, actividad, randomUUID(), 'editar', { montoCentesimos: 100 }, creado.pago.id, 1);
    expect(notificarPago).toHaveBeenCalledTimes(1);
    jest.spyOn(PagosRepositorio.prototype, 'confirmar').mockRejectedValueOnce(new Error('Falla antes del commit'));
    await expect(
      pagos.ejecutar(usuarioB, actividad, randomUUID(), 'editar', { montoCentesimos: 150 }, creado.pago.id, 1),
    ).rejects.toThrow('Falla antes del commit');
    expect(notificarPago).toHaveBeenCalledTimes(1);
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(200);
    const editado = await pagos.ejecutar(
      usuarioB,
      actividad,
      randomUUID(),
      'editar',
      { montoCentesimos: 150 },
      creado.pago.id,
      1,
    );
    expect(notificarPago).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'pagoEditado' }));
    await pagos.ejecutar(usuarioB, actividad, randomUUID(), 'eliminar', null, creado.pago.id, editado.pago.version);
    expect(notificarPago).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'pagoEliminado' }));
    expect(notificarPago).toHaveBeenCalledTimes(3);
  });

  it('Socket.IO real: CRUD de gastos y pagos refresca otra sesión del autor y del participante, sin avisar a ajenos', async () => {
    const fallos = jest.fn();
    const eventosGastos = new Observable<EventoGasto>(fallos);
    const eventosPagos = new Observable<EventoPago>(fallos);
    const config = leerConfig({
      POSTGRES_URL: destino,
      REDIS_URL: redisDestino,
      MONGO_URL: 'mongodb://localhost:27018',
      SESION_DIAS: '1',
      LOGIN_MAX_INTENTOS: '5',
      LOGIN_BLOQUEO_MINUTOS: '15',
      LIMITE_AUTH_SOLICITUDES: '100',
      LIMITE_AUTH_VENTANA_MINUTOS: '1',
      ACTIVIDAD_DESTINO_PROVISIONAL_LAT: '-34.9',
      ACTIVIDAD_DESTINO_PROVISIONAL_LNG: '-56.2',
      ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO: 'Montevideo',
    });
    const canalServidor = createServer(
      crearApp({
        config,
        db,
        redis,
        mongo: {} as Db,
        sesiones,
        logger,
        eventosGastos,
        eventosPagos,
        verificadorGoogle: new VerificadorGoogle([], logger),
        notificaciones: {} as NotificacionesServicio,
      }),
    );
    const tiempoReal = TiempoReal.iniciar(canalServidor, { origenes: [], sesiones, logger });
    const desconectar = conectarActualizacionesFinancieras(
      eventosGastos,
      eventosPagos,
      new FinanzasTiempoRealObservador(new FinanzasTiempoRealRepositorio(db), tiempoReal),
    );
    await new Promise<void>((resolve) => canalServidor.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(canalServidor.address() as AddressInfo).port}`;
    const conexiones: Awaited<ReturnType<typeof abrirSocket>>[] = [];
    const segundaSesion = await sesiones.crear(usuarioA);
    try {
      for (const token of [tokenA, segundaSesion.token, tokenB, tokenAjeno]) conexiones.push(await abrirSocket(base, token));
      let cambios = 0;
      async function escribir(ruta: string, metodo: string, cuerpo?: unknown, token = tokenA) {
        const r = await fetch(`${base}/api/actividades/${actividad}${ruta}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        });
        expect(r.status).toBeLessThan(300);
        const respuesta = (await r.json()) as { gasto: GastoDto; pago: PagoDto };
        cambios++;
        const limite = Date.now() + 3000;
        while (conexiones.slice(0, 3).some((c) => c.avisos.length < cambios) && Date.now() < limite)
          await new Promise((resolve) => setTimeout(resolve, 10));
        for (const conexion of conexiones.slice(0, 3)) {
          expect(conexion.avisos).toHaveLength(cambios);
          expect(conexion.avisos[cambios - 1]).toEqual({ actividadId: actividad });
        }
        expect(conexiones[3].avisos).toHaveLength(0);
        return respuesta;
      }
      const g = (await escribir('/gastos', 'POST', datos({ montoCentesimos: 1000 }))).gasto;
      expect((await repo.balances(actividad))[0].montoCentesimos).toBe(1300);
      await escribir(`/gastos/${g.id}`, 'PUT', { ...datos({ montoCentesimos: 1500 }), version: 1 });
      expect((await repo.balances(actividad))[0].montoCentesimos).toBe(1800);
      await escribir(`/gastos/${g.id}`, 'DELETE', { version: 2 });
      expect((await repo.balances(actividad))[0].montoCentesimos).toBe(300);
      const p = (await escribir('/pagos', 'POST', datosPago(100), tokenB)).pago;
      expect((await repo.balances(actividad))[0].montoCentesimos).toBe(200);
      await escribir(`/pagos/${p.id}`, 'PUT', { montoCentesimos: 150, version: 1 }, tokenB);
      expect((await repo.balances(actividad))[0].montoCentesimos).toBe(150);
      await escribir(`/pagos/${p.id}`, 'DELETE', { version: 2 }, tokenB);
      expect((await repo.balances(actividad))[0].montoCentesimos).toBe(300);
      expect(fallos).not.toHaveBeenCalled();
    } finally {
      desconectar();
      for (const conexion of conexiones) conexion.socket.close();
      await sesiones.cerrar(segundaSesion.token);
      await new Promise<void>((resolve) => canalServidor.close(() => resolve()));
    }
  }, 15000);

  it('CU26 FP: sugiere deuda completa, registra parcial y luego total', async () => {
    const opciones = await pagos.opciones(usuarioB, actividad);
    expect(opciones.deudas).toEqual([{ deudorId: participacionB, acreedorId: participacionA, montoCentesimos: 300 }]);
    const r = await http('/pagos', 'POST', datosPago(), tokenB);
    expect(r.estado).toBe(201);
    expect(r.cuerpo.pago).toMatchObject({
      pagadorId: participacionB,
      receptorId: participacionA,
      registradoPorId: participacionB,
      version: 1,
    });
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(200);
    await pagar(200);
    expect(await repo.balances(actividad)).toEqual([]);
  });
  it('P1: quien cobró también puede registrar; un tercero no', async () => {
    expect((await http('/pagos', 'POST', datosPago(), tokenA)).estado).toBe(201);
    await db.query('INSERT INTO participacion(actividad_id,usuario_id) VALUES($1,$2)', [actividad, usuarioAjeno]);
    expect((await http('/pagos', 'POST', datosPago(), tokenAjeno)).estado).toBe(403);
  });
  it('P2/RN4: solo pagador y receptor consultan historial/detalle, incluido el organizador ajeno al pago', async () => {
    const p = await pagar();
    await db.query('INSERT INTO participacion(actividad_id,usuario_id) VALUES($1,$2)', [actividad, usuarioAjeno]);
    expect((await http('/pagos')).cuerpo.pagos).toHaveLength(1);
    expect((await http('/pagos', 'GET', undefined, tokenB)).cuerpo.pagos).toHaveLength(1);
    expect((await http('/pagos', 'GET', undefined, tokenAjeno)).cuerpo.pagos).toHaveLength(0);
    expect((await http(`/pagos/${p.pago.id}`, 'GET', undefined, tokenAjeno)).estado).toBe(404);
    expect((await pagos.consultarOperacion(usuarioA, actividad, 'otra_clave_123456789')).estado).toBe('noRegistrada');
  });
  it('A1: abrir opciones y cancelar no modifica pagos ni balance', async () => {
    await http('/pagos/opciones');
    expect((await db.query('SELECT id FROM pago')).rows).toHaveLength(0);
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(300);
  });
  it.each([0, -1, 301, 1.5, '100', 'no-numérico', null])('E1: importe %p indica máximo y no modifica datos', async (monto) => {
    const r = await http('/pagos', 'POST', datosPago(monto), tokenB);
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.campos?.montoCentesimos).toContain('3.00');
    expect((await db.query('SELECT id FROM pago')).rows).toHaveLength(0);
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(300);
  });
  it('E1: monto ausente también informa máximo vigente', async () => {
    const r = await http('/pagos', 'POST', { pagadorId: participacionB, receptorId: participacionA }, tokenB);
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.campos?.montoCentesimos).toContain('3.00');
  });
  it('E2: no acepta pagos sobre deuda saldada ni en dirección opuesta', async () => {
    await expect(
      pagos.ejecutar(usuarioA, actividad, randomUUID(), 'registrar', {
        pagadorId: participacionA,
        receptorId: participacionB,
        montoCentesimos: 100,
      }),
    ).rejects.toMatchObject({ codigo: 'SIN_DEUDA_PENDIENTE' });
    await pagar(300);
    await expect(pagar()).rejects.toMatchObject({ codigo: 'SIN_DEUDA_PENDIENTE' });
  });
  it.each(['archivada', 'programada', 'cancelada'])('E3/RN6: estado %s no admite escrituras', async (estado) => {
    await db.query('UPDATE actividad SET estado=$2,fecha_archivado=now() WHERE id=$1', [actividad, estado]);
    await expect(pagar()).rejects.toMatchObject({ codigo: 'ACTIVIDAD_NO_ADMITE_PAGOS' });
    expect((await pagos.listar(usuarioB, actividad)).pagos).toEqual([]);
  });
  it('RN6/glosario: rechaza al cumplirse 14 días aunque CU32 todavía no haya archivado', async () => {
    await db.query("UPDATE actividad SET fecha_hora_inicio=now()-interval '14 days' WHERE id=$1", [actividad]);
    await expect(pagar()).rejects.toMatchObject({ codigo: 'ACTIVIDAD_NO_ADMITE_PAGOS' });
    expect((await pagos.opciones(usuarioB, actividad)).puedeEscribir).toBe(false);
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(300);
  });
  it('RN1: exige sesión, participación, misma actividad y dos personas distintas', async () => {
    expect((await http('/pagos', 'GET', undefined, '')).estado).toBe(401);
    expect((await http('/pagos', 'GET', undefined, tokenAjeno)).estado).toBe(403);
    expect((await http('/pagos', 'POST', { ...datosPago(), receptorId: randomUUID() }, tokenB)).estado).toBe(400);
    expect((await http('/pagos', 'POST', { ...datosPago(), receptorId: participacionB }, tokenB)).estado).toBe(403);
    await expect(pagos.opciones(usuarioB, randomUUID())).rejects.toMatchObject({ estado: 404 });
  });
  it('RN7: deuda de invitada se paga desde su responsable', async () => {
    await crear({ pagadorId: `p:${participacionB}`, participantes: [`i:${invitado}`], montoCentesimos: 500 });
    const r = await pagos.ejecutar(usuarioA, actividad, randomUUID(), 'registrar', {
      pagadorId: participacionA,
      receptorId: participacionB,
      montoCentesimos: 200,
    });
    expect(r.pago.pagadorId).toBe(participacionA);
    expect(await repo.balances(actividad)).toEqual([]);
  });
  it('RNF-23: mismo intento concurrente y respuesta perdida producen un único pago', async () => {
    const clave = randomUUID();
    const [a, b] = await Promise.all([pagar(100, clave), pagar(100, clave)]);
    expect(a).toEqual(b);
    expect((await db.query('SELECT id FROM pago')).rows).toHaveLength(1);
    expect((await pagos.consultarOperacion(usuarioB, actividad, clave)).estado).toBe('confirmada');
    expect(await pagar(100, clave)).toEqual(a);
    await expect(pagar(101, clave)).rejects.toMatchObject({ codigo: 'INTENTO_MODIFICADO' });
  });
  it('RN2: pagos concurrentes distintos revalidan la deuda al adquirir el bloqueo', async () => {
    const r = await Promise.allSettled([pagar(200), pagar(200)]);
    expect(r.filter((p) => p.status === 'fulfilled')).toHaveLength(1);
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(100);
  });
  it('CU24 FP/A2: máximo excluye pago previo, permite aumentar, sin cambios conserva versión', async () => {
    const p = await pagar(100);
    expect((await pagos.detalle(usuarioA, actividad, p.pago.id)).maximoCentesimos).toBe(300);
    const editar = (monto: number, version: number) =>
      pagos.ejecutar(usuarioB, actividad, randomUUID(), 'editar', { montoCentesimos: monto }, p.pago.id, version);
    expect((await editar(250, 1)).pago.version).toBe(2);
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(50);
    expect(await editar(250, 2)).toMatchObject({ sinCambios: true, pago: { version: 2 } });
    await expect(editar(301, 2)).rejects.toMatchObject({ codigo: 'MONTO_PAGO_INVALIDO' });
    await expect(editar(200, 1)).rejects.toMatchObject({ codigo: 'PAGO_MODIFICADO' });
  });
  it('CU24/CU25: solo autor; no permite cambiar personas; versión requiere reconfirmar', async () => {
    const p = await pagar();
    expect((await http(`/pagos/${p.pago.id}`, 'PUT', { montoCentesimos: 50, version: 1 }, tokenA)).estado).toBe(403);
    expect((await http(`/pagos/${p.pago.id}`, 'PUT', { ...datosPago(), version: 1 }, tokenB)).estado).toBe(400);
    expect((await http(`/pagos/${p.pago.id}`, 'DELETE', { version: 2 }, tokenB)).estado).toBe(409);
    const clave = randomUUID();
    const a = await http(`/pagos/${p.pago.id}`, 'DELETE', { version: 1 }, tokenB, clave);
    expect(a.estado).toBe(200);
    expect(a.cuerpo.pago.eliminado).toBe(true);
    expect((await http(`/pagos/${p.pago.id}`, 'DELETE', { version: 1 }, tokenB, clave)).cuerpo.pago).toEqual(a.cuerpo.pago);
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(300);
    expect((await http(`/pagos/${p.pago.id}`, 'GET', undefined, tokenB)).estado).toBe(404);
  });
  it('ER1: falla después de guardar revierte pago y balance, y permite reintentar', async () => {
    const recalcular = jest.spyOn(PagosRepositorio.prototype, 'confirmar').mockRejectedValueOnce(new Error('falla de prueba'));
    const clave = randomUUID();
    await expect(pagar(100, clave)).rejects.toThrow('falla de prueba');
    expect((await db.query('SELECT id FROM pago')).rows).toHaveLength(0);
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(300);
    expect((await pagos.consultarOperacion(usuarioB, actividad, clave)).estado).toBe('noRegistrada');
    recalcular.mockRestore();
    await pagar(100, clave);
  });
  it('RN4: pagina con microsegundos sin duplicar ni omitir pagos; rechaza cursor inválido', async () => {
    for (let i = 0; i < 23; i++) await pagar(1);
    await db.query("UPDATE pago SET fecha_registro='2026-11-22T00:00:00.123456Z'");
    const a = await pagos.listar(usuarioB, actividad);
    const b = await pagos.listar(usuarioB, actividad, a.siguienteCursor!);
    expect(a.pagos).toHaveLength(20);
    expect(b.pagos).toHaveLength(3);
    expect(new Set([...a.pagos, ...b.pagos].map((p) => p.id)).size).toBe(23);
    await expect(pagos.listar(usuarioB, actividad, 'invalido')).rejects.toMatchObject({ estado: 400 });
  });
  it('RNF-16: seis meses calendario desde archivo, retiro atómico sin recrear deuda', async () => {
    const clave = randomUUID();
    const p = await pagar(100, clave);
    await db.query(
      "UPDATE actividad SET estado='archivada',fecha_archivado=now()-interval '6 months'+interval '1 day' WHERE id=$1",
      [actividad],
    );
    expect((await pagos.listar(usuarioB, actividad)).pagos).toHaveLength(1);
    expect(await enTransaccion(db, (tx) => new PagosRetencionRepositorio(tx).retirarHistorialVencido())).toBe(0);
    await db.query("UPDATE actividad SET fecha_archivado=now()-interval '6 months' WHERE id=$1", [actividad]);
    expect((await pagos.listar(usuarioB, actividad)).opciones.historialVencido).toBe(true);
    expect((await pagos.listar(usuarioB, actividad)).pagos).toHaveLength(0);
    await expect(pagos.detalle(usuarioB, actividad, p.pago.id)).rejects.toMatchObject({ estado: 410 });
    await expect(pagos.consultarOperacion(usuarioB, actividad, clave)).rejects.toMatchObject({ estado: 410 });
    await expect(pagar(100, clave)).rejects.toMatchObject({ estado: 410 });
    expect(await enTransaccion(db, (tx) => new PagosRetencionRepositorio(tx).retirarHistorialVencido())).toBe(1);
    expect((await db.query('SELECT id FROM pago')).rows).toHaveLength(0);
    expect((await db.query('SELECT clave FROM operacion_pago')).rows).toHaveLength(0);
    await enTransaccion(db, (tx) => new GastosRepositorio(tx).recalcular(actividad));
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(200);
    expect(await enTransaccion(db, (tx) => new PagosRetencionRepositorio(tx).retirarHistorialVencido())).toBe(0);
  });
  it('RNF-16/ER1: fallo al retirar historial revierte el acumulado y admite nuevo intento', async () => {
    await pagar();
    await db.query("UPDATE actividad SET estado='archivada',fecha_archivado=now()-interval '7 months' WHERE id=$1", [actividad]);
    await expect(
      enTransaccion(db, async (tx) => {
        await new PagosRetencionRepositorio(tx).retirarHistorialVencido();
        throw new Error('interrupción');
      }),
    ).rejects.toThrow('interrupción');
    expect((await db.query('SELECT id FROM pago')).rows).toHaveLength(1);
    expect((await db.query('SELECT monto FROM pago_acumulado_archivado')).rows).toHaveLength(0);
  });
  it('Protección Supabase: tablas financieras con RLS y sin grants de PUBLIC', async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(
      `SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($2)`,
      [esquema, ['pago', 'balance', 'gasto', 'operacion_pago', 'operacion_gasto']],
    );
    expect(r.rows).toHaveLength(5);
    expect(r.rows.every((t) => t.relrowsecurity)).toBe(true);
    expect(
      (
        await db.query(`SELECT grantee FROM information_schema.table_privileges WHERE table_schema=$1 AND grantee='PUBLIC'`, [
          esquema,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it('RNF-23: recupera el mismo intento confirmado después del archivo, dentro de la retención', async () => {
    const clave = randomUUID();
    const p = await pagar(100, clave);
    await db.query("UPDATE actividad SET estado='archivada',fecha_archivado=now() WHERE id=$1", [actividad]);
    expect(await pagar(100, clave)).toEqual(p);
    expect((await pagos.consultarOperacion(usuarioB, actividad, clave)).estado).toBe('confirmada');
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(200);
  });
  it('RNF-16: seis meses son calendario, no 180 días', async () => {
    await db.query("UPDATE actividad SET estado='archivada',fecha_archivado='2026-05-31T12:00:00Z' WHERE id=$1", [actividad]);
    expect((await pagos.opciones(usuarioB, actividad)).historialHasta).toBe('2026-11-30T12:00:00.000Z');
  });
  it('RNF-16: retirar pagos eliminados no conserva su efecto financiero', async () => {
    const p = await pagar();
    await pagos.ejecutar(usuarioB, actividad, randomUUID(), 'eliminar', null, p.pago.id, 1);
    await db.query("UPDATE actividad SET estado='archivada',fecha_archivado=now()-interval '7 months' WHERE id=$1", [actividad]);
    await enTransaccion(db, (tx) => new PagosRetencionRepositorio(tx).retirarHistorialVencido());
    expect((await db.query('SELECT monto FROM pago_acumulado_archivado')).rows).toHaveLength(0);
    await enTransaccion(db, (tx) => new GastosRepositorio(tx).recalcular(actividad));
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(300);
  });
});

/** Cliente mínimo de prueba Engine.IO/Socket.IO sobre el WebSocket nativo de Node, sin nuevas dependencias. */
async function abrirSocket(base: string, token: string) {
  const socket = new WebSocket(`${base.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`);
  const avisos: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    const temporizador = setTimeout(() => {
      socket.close();
      reject(new Error('El socket de prueba no se autenticó a tiempo'));
    }, 3000);
    socket.addEventListener('error', () => {
      clearTimeout(temporizador);
      reject(new Error('Falló el socket de prueba'));
    });
    socket.addEventListener('message', (mensaje) => {
      const trama = String(mensaje.data);
      if (trama.startsWith('0')) socket.send(`40${JSON.stringify({ token })}`);
      if (trama === '2') socket.send('3');
      if (trama.startsWith('40')) {
        clearTimeout(temporizador);
        resolve();
      }
      if (trama.startsWith('42')) {
        const [evento, datos] = JSON.parse(trama.slice(2)) as [string, unknown];
        if (evento === 'finanzas:actualizadas') avisos.push(datos);
      }
    });
  });
  return { socket, avisos };
}
