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

const destino = process.env.POSTGRES_URL_TEST;
const redisDestino = process.env.REDIS_URL_TEST;
const integracion = destino && redisDestino ? describe : describe.skip;
integracion('CU23–CU25 HTTP y SQL reales, esquema aislado', () => {
  const esquema = `gastos_${randomUUID().replaceAll('-', '')}`;
  const [usuarioA, usuarioB, usuarioAjeno, actividad, participacionA, participacionB, invitado] = Array.from({ length: 7 }, () =>
    randomUUID(),
  );
  let admin: Pool;
  let db: Pool;
  let redis: Redis;
  let servicio: GastosServicio;
  let repo: GastosRepositorio;
  let servidor: Server;
  let url: string;
  let tokenA: string;
  let tokenB: string;
  let tokenAjeno: string;
  let sesiones: SesionesRepositorio;
  const notificar = jest.fn();
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
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { gasto: GastoDto; personas: unknown[] } };
  }

  it('CU23 FP: registra gasto, reparto y balance como una operación', async () => {
    const r = await http('/gastos', 'POST', datos());
    expect(r.estado).toBe(201);
    expect(r.cuerpo.gasto.version).toBe(1);
    expect(await repo.balances(actividad)).toEqual([
      { deudorId: participacionB, acreedorId: participacionA, montoCentesimos: 300 },
    ]);
    const avisos = await db.query<{ usuario_id: string; tipo: string }>(
      'SELECT usuario_id,tipo FROM notificacion_gasto_pendiente WHERE gasto_id=$1 ORDER BY usuario_id',
      [r.cuerpo.gasto.id],
    );
    expect(avisos.rows.map((a) => a.usuario_id).sort()).toEqual([usuarioA, usuarioB].sort());
    expect(avisos.rows.every((a) => a.tipo === 'gastoRegistrado')).toBe(true);
  });
  it('CU23 RN4/RN6 D3: invitada pagadora conserva identidad y crédito del responsable', async () => {
    const r = await crear({
      pagadorId: `i:${invitado}`,
      montoCentesimos: 301,
      participantes: [`p:${participacionA}`, `p:${participacionB}`, `i:${invitado}`],
    });
    expect(r.gasto.pagadorId).toBe(`i:${invitado}`);
    expect(r.gasto.partes.reduce((s, p) => s + p.montoCentesimos, 0)).toBe(301);
    expect(await repo.balances(actividad)).toEqual([
      { deudorId: participacionB, acreedorId: participacionA, montoCentesimos: 100 },
    ]);
  });
  it.each([
    { montoCentesimos: 0 },
    { concepto: '' },
    { participantes: [] },
    { participantes: [`p:${participacionB}`, `p:${participacionB}`] },
    { pagadorId: `p:${randomUUID()}` },
    { participantes: [`p:${randomUUID()}`] },
  ])('CU23 E1/E2/RN5: rechaza %p sin efectos parciales', async (cambio) => {
    const r = await http('/gastos', 'POST', datos(cambio));
    expect(r.estado).toBe(400);
    expect((await repo.listar(actividad)).gastos).toHaveLength(0);
    expect(await repo.balances(actividad)).toEqual([]);
  });
  it.each(['programada', 'archivada', 'cancelada'])('CU23 E3: rechaza actividad %s', async (estado) => {
    await db.query('UPDATE actividad SET estado=$2 WHERE id=$1', [actividad, estado]);
    await expect(crear()).rejects.toMatchObject({ codigo: 'ACTIVIDAD_NO_ADMITE_GASTOS' });
  });
  it('CU23 RN2: rechaza exactamente al vencer los 14 días', async () => {
    await db.query("UPDATE actividad SET fecha_hora_inicio=now()-interval '14 days' WHERE id=$1", [actividad]);
    await expect(crear()).rejects.toMatchObject({ codigo: 'ACTIVIDAD_NO_ADMITE_GASTOS' });
  });
  it('CU23 RN1 / CU24 RN1: exige sesión, participación y autoría', async () => {
    expect((await http('/gastos', 'GET', undefined, '')).estado).toBe(401);
    expect((await http('/gastos', 'POST', datos(), tokenAjeno)).estado).toBe(403);
    const g = await crear();
    expect((await http(`/gastos/${g.gasto.id}`, 'PUT', { ...datos(), version: 1 }, tokenB)).estado).toBe(403);
    expect((await http(`/gastos/${g.gasto.id}`, 'DELETE', { version: 1 }, tokenB)).estado).toBe(403);
    await db.query('DELETE FROM parte_gasto WHERE participacion_id=$1', [participacionB]);
    await db.query('DELETE FROM balance WHERE actividad_id=$1', [actividad]);
    await db.query('DELETE FROM participacion WHERE id=$1', [participacionB]);
    expect((await http('/gastos', 'GET', undefined, tokenB)).estado).toBe(403);
  });
  it('CU23 ER1/RNF-10: dos solicitudes simultáneas y reenvío tras perder respuesta no duplican', async () => {
    const clave = randomUUID();
    const resultados = await Promise.all([crear({}, clave), crear({}, clave)]);
    expect(resultados[0].gasto.id).toBe(resultados[1].gasto.id);
    expect((await repo.listar(actividad)).gastos).toHaveLength(1);
    expect((await servicio.consultarOperacion(usuarioA, actividad, clave)).estado).toBe('confirmada');
    expect((await servicio.consultarOperacion(usuarioB, actividad, clave)).estado).toBe('noRegistrada');
    expect(notificar).toHaveBeenCalledTimes(1);
    await expect(crear({ montoCentesimos: 301 }, clave)).rejects.toMatchObject({ codigo: 'INTENTO_MODIFICADO' });
  });
  it('CU24 FP: cambia pagador y reparto, retirando efectos de quienes salen', async () => {
    const g = await crear();
    const editado = await servicio.ejecutar(
      usuarioA,
      actividad,
      randomUUID(),
      'editar',
      datos({ montoCentesimos: 550, pagadorId: `p:${participacionB}`, participantes: [`i:${invitado}`] }),
      g.gasto.id,
      1,
    );
    expect(editado.gasto.version).toBe(2);
    expect(await repo.balances(actividad)).toEqual([
      { deudorId: participacionA, acreedorId: participacionB, montoCentesimos: 550 },
    ]);
  });
  it('CU24 A2: confirmar sin cambios conserva versión y no recalcula', async () => {
    const g = await crear();
    notificar.mockClear();
    const recalcular = jest.spyOn(GastosRepositorio.prototype, 'recalcular');
    const r = await servicio.ejecutar(usuarioA, actividad, randomUUID(), 'editar', datos(), g.gasto.id, 1);
    expect(r.sinCambios).toBe(true);
    expect(r.gasto.version).toBe(1);
    expect(recalcular).not.toHaveBeenCalled();
    expect(notificar).not.toHaveBeenCalled();
    expect((await db.query('SELECT id FROM notificacion_gasto_pendiente WHERE gasto_id=$1', [g.gasto.id])).rowCount).toBe(2);
  });
  it('CU24: notifica solo al pagador y reparto NUEVOS, sin copiar al autor anterior', async () => {
    const g = await crear();
    const participacionNueva = randomUUID();
    await db.query('INSERT INTO participacion(id,actividad_id,usuario_id) VALUES($1,$2,$3)', [
      participacionNueva,
      actividad,
      usuarioAjeno,
    ]);
    const r = await servicio.ejecutar(
      usuarioA,
      actividad,
      randomUUID(),
      'editar',
      datos({ pagadorId: `p:${participacionNueva}`, participantes: [`p:${participacionNueva}`] }),
      g.gasto.id,
      1,
    );
    const avisos = await db.query<{ usuario_id: string }>(
      'SELECT usuario_id FROM notificacion_gasto_pendiente WHERE gasto_id=$1 AND version=$2',
      [g.gasto.id, r.gasto.version],
    );
    expect(avisos.rows).toEqual([{ usuario_id: usuarioAjeno }]);
  });
  it('CU23 RN4: invita a notificar al responsable una sola vez, aunque también haya pagado', async () => {
    const g = await crear({
      pagadorId: `i:${invitado}`,
      participantes: [`i:${invitado}`, `p:${participacionA}`, `p:${participacionB}`],
    });
    const avisos = await db.query<{ usuario_id: string }>(
      'SELECT usuario_id FROM notificacion_gasto_pendiente WHERE gasto_id=$1',
      [g.gasto.id],
    );
    expect(avisos.rows.map((a) => a.usuario_id).sort()).toEqual([usuarioA, usuarioB].sort());
  });
  it('CU23 ER1: los reintentos no vuelven a reservar avisos de una versión confirmada', async () => {
    const clave = randomUUID();
    const g = await crear({}, clave);
    await crear({}, clave);
    expect((await db.query('SELECT id FROM notificacion_gasto_pendiente WHERE gasto_id=$1', [g.gasto.id])).rowCount).toBe(2);
  });
  it('CU25: reserva avisos de eliminación para los involucrados del gasto eliminado', async () => {
    const g = await crear();
    await servicio.ejecutar(usuarioA, actividad, randomUUID(), 'eliminar', null, g.gasto.id, 1);
    const avisos = await db.query<{ usuario_id: string; tipo: string }>(
      'SELECT usuario_id,tipo FROM notificacion_gasto_pendiente WHERE gasto_id=$1 AND version=2',
      [g.gasto.id],
    );
    expect(avisos.rows.map((a) => a.usuario_id).sort()).toEqual([usuarioA, usuarioB].sort());
    expect(avisos.rows.every((a) => a.tipo === 'gastoEliminado')).toBe(true);
  });
  it('CU23: un fallo al reservar avisos revierte el gasto, el balance y la intención', async () => {
    jest
      .spyOn(GastosRepositorio.prototype, 'encolarNotificaciones')
      .mockRejectedValueOnce(new Error('Falla SQL de cola de prueba'));
    await expect(crear()).rejects.toThrow('Falla SQL de cola');
    expect((await repo.listar(actividad)).gastos).toHaveLength(0);
    expect(await repo.balances(actividad)).toEqual([]);
    expect((await db.query('SELECT id FROM notificacion_gasto_pendiente')).rowCount).toBe(0);
    expect(notificar).not.toHaveBeenCalled();
  });
  it('CU24 ER1: consulta y reenvío recuperan la edición confirmada incluso tras archivar', async () => {
    const g = await crear();
    const clave = randomUUID();
    const cambios = datos({ montoCentesimos: 777 });
    await servicio.ejecutar(usuarioA, actividad, clave, 'editar', cambios, g.gasto.id, 1);
    await db.query("UPDATE actividad SET estado='archivada' WHERE id=$1", [actividad]);
    expect(await servicio.consultarOperacion(usuarioA, actividad, clave)).toMatchObject({
      estado: 'confirmada',
      resultado: { gasto: { version: 2, montoCentesimos: 777 } },
    });
    expect((await servicio.ejecutar(usuarioA, actividad, clave, 'editar', cambios, g.gasto.id, 1)).gasto.version).toBe(2);
  });
  it('CU24 E1/E2/E4: valida edición y detecta un gasto ya eliminado', async () => {
    const g = await crear();
    expect((await http(`/gastos/${g.gasto.id}`, 'PUT', { ...datos({ participantes: [] }), version: 1 })).estado).toBe(400);
    await servicio.ejecutar(usuarioA, actividad, randomUUID(), 'eliminar', null, g.gasto.id, 1);
    await expect(servicio.ejecutar(usuarioA, actividad, randomUUID(), 'editar', datos(), g.gasto.id, 1)).rejects.toMatchObject({
      codigo: 'GASTO_NO_DISPONIBLE',
    });
  });
  it('CU24 E4: dos ediciones de la misma versión no se sobrescriben', async () => {
    const g = await crear();
    const r = await Promise.allSettled(
      [400, 500].map((montoCentesimos) =>
        servicio.ejecutar(usuarioA, actividad, randomUUID(), 'editar', datos({ montoCentesimos }), g.gasto.id, 1),
      ),
    );
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: { codigo: 'GASTO_MODIFICADO' } });
  });
  it('CU25 FP/RN6: elimina una vez y recupera la misma respuesta de reintento', async () => {
    const g = await crear();
    const clave = randomUUID();
    const r = await servicio.ejecutar(usuarioA, actividad, clave, 'eliminar', null, g.gasto.id, 1);
    expect(r.gasto.eliminado).toBe(true);
    expect(await repo.balances(actividad)).toEqual([]);
    expect((await servicio.ejecutar(usuarioA, actividad, clave, 'eliminar', null, g.gasto.id, 1)).gasto.id).toBe(g.gasto.id);
    await expect(servicio.ejecutar(usuarioA, actividad, randomUUID(), 'eliminar', null, g.gasto.id, 1)).rejects.toMatchObject({
      codigo: 'GASTO_NO_DISPONIBLE',
    });
    await expect(servicio.detalle(usuarioA, actividad, g.gasto.id)).rejects.toMatchObject({ estado: 404 });
  });
  it('CU25 E2: exige nueva confirmación si cambió el gasto', async () => {
    const g = await crear();
    await servicio.ejecutar(usuarioA, actividad, randomUUID(), 'editar', datos({ montoCentesimos: 400 }), g.gasto.id, 1);
    await expect(servicio.ejecutar(usuarioA, actividad, randomUUID(), 'eliminar', null, g.gasto.id, 1)).rejects.toMatchObject({
      codigo: 'GASTO_MODIFICADO',
    });
    expect((await repo.detalle(actividad, g.gasto.id))?.eliminado).toBe(false);
  });
  it.each(['editar', 'eliminar'] as const)('CU24/CU25 ER2: rollback de %s si falla el recálculo', async (accion) => {
    const g = await crear();
    const clave = randomUUID();
    notificar.mockClear();
    jest.spyOn(GastosRepositorio.prototype, 'recalcular').mockRejectedValueOnce(new Error('Falla SQL de prueba'));
    await expect(
      servicio.ejecutar(
        usuarioA,
        actividad,
        clave,
        accion,
        accion === 'editar' ? datos({ montoCentesimos: 500 }) : null,
        g.gasto.id,
        1,
      ),
    ).rejects.toThrow('Falla SQL');
    expect((await repo.detalle(actividad, g.gasto.id))?.version).toBe(1);
    expect((await repo.detalle(actividad, g.gasto.id))?.eliminado).toBe(false);
    expect((await repo.balances(actividad))[0].montoCentesimos).toBe(300);
    expect(await repo.operacion(actividad, usuarioA, clave)).toBeNull();
    expect(notificar).not.toHaveBeenCalled();
  });
  it('CU23 ER2: rollback del alta completa y auditoría del fallo', async () => {
    jest.spyOn(GastosRepositorio.prototype, 'recalcular').mockRejectedValueOnce(new Error('Falla SQL de prueba'));
    await expect(crear()).rejects.toThrow('Falla SQL');
    expect((await repo.listar(actividad)).gastos).toHaveLength(0);
    const auditoria = await db.query<{ evento: { resultado: string } }>(
      'SELECT evento FROM auditoria_gasto_pendiente ORDER BY fecha DESC LIMIT 1',
    );
    expect(auditoria.rows[0].evento.resultado).toBe('fallida');
  });
  it('CU24/CU25: conserva el efecto de pagos anteriores, incluso si invierte la deuda', async () => {
    const g = await crear();
    await db.query('INSERT INTO pago(actividad_id,pagador_id,receptor_id,registrado_por_id,monto) VALUES($1,$2,$3,$2,1.50)', [
      actividad,
      participacionB,
      participacionA,
    ]);
    await servicio.ejecutar(usuarioA, actividad, randomUUID(), 'editar', datos({ montoCentesimos: 100 }), g.gasto.id, 1);
    expect(await repo.balances(actividad)).toEqual([
      { deudorId: participacionA, acreedorId: participacionB, montoCentesimos: 50 },
    ]);
  });
  it('paginación: cursor con microsegundos y consultas de detalle/balances', async () => {
    await db.query(
      `INSERT INTO gasto(actividad_id,registrado_por_id,pagado_por_id,concepto,monto,fecha_registro)
      SELECT $1,$2,$2,'Gasto '||i,1.00,'2026-11-22T12:00:00.123456Z'::timestamptz FROM generate_series(1,24) i`,
      [actividad, participacionA],
    );
    const primera = await servicio.listar(usuarioA, actividad);
    const segunda = await servicio.listar(usuarioA, actividad, primera.siguienteCursor!);
    expect(primera.gastos).toHaveLength(20);
    expect(segunda.gastos).toHaveLength(4);
    expect(new Set([...primera.gastos, ...segunda.gastos].map((g) => g.id)).size).toBe(24);
    expect((await http('/balances')).estado).toBe(200);
    expect((await http('/gastos/opciones')).cuerpo.personas).toHaveLength(3);
    await expect(servicio.listar(usuarioA, actividad, 'invalido')).rejects.toMatchObject({ estado: 400 });
  });
});
