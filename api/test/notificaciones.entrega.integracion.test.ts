import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { NotificacionesRepositorio } from '../src/modulos/notificaciones/notificaciones.repositorio';
import { NotificacionesServicio } from '../src/modulos/notificaciones/notificaciones.servicio';

const destino = process.env.MONGO_URL_TEST;
const integracion = destino ? describe : describe.skip;

integracion('CU23–CU25 + CU40: entregas idempotentes con MongoDB real', () => {
  const nombre = `faltauno_test_notificaciones_${randomUUID().replaceAll('-', '')}`;
  const usuario = randomUUID();
  let cliente: MongoClient;
  let db: Db;
  let conectado = false;
  let repositorio: NotificacionesRepositorio;
  let servicio: NotificacionesServicio;
  const emitirAUsuario = jest.fn();
  const datos = {
    tipo: 'gastoRegistrado' as const,
    texto: 'Gasto de prueba local',
    destino: { tipo: 'actividad' as const, id: randomUUID() },
  };
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(destino!).hostname))
      throw new Error('La integración de notificaciones requiere MongoDB local.');
    cliente = new MongoClient(destino!, { serverSelectionTimeoutMS: 3000 });
    await cliente.connect();
    conectado = true;
    db = cliente.db(nombre);
    repositorio = new NotificacionesRepositorio(db);
    await repositorio.crearIndices(30);
    servicio = new NotificacionesServicio(repositorio, { emitirAUsuario });
  });
  beforeEach(async () => {
    emitirAUsuario.mockClear();
    await db.collection('notificaciones').deleteMany({});
  });
  afterAll(async () => {
    if (conectado) await db.dropDatabase();
    if (cliente) await cliente.close();
  });
  it('una entrega concurrente se persiste una sola vez y conserva el mismo ID en los eventos', async () => {
    const claveEntrega = `gasto:${randomUUID()}`;
    const avisos = await Promise.all(Array.from({ length: 6 }, () => servicio.notificar(usuario, { ...datos, claveEntrega })));
    expect(new Set(avisos.map((n) => n.id)).size).toBe(1);
    expect(await db.collection('notificaciones').countDocuments({ usuarioId: usuario })).toBe(1);
    expect(await servicio.contarNoLeidas(usuario)).toEqual({ cantidad: 1 });
    expect(new Set(emitirAUsuario.mock.calls.map((llamada) => llamada[2].notificacion.id)).size).toBe(1);
  });
  it('reintentar después de marcar leída no resetea lectura ni fecha de creación', async () => {
    const claveEntrega = `gasto:${randomUUID()}`;
    const primera = await servicio.notificar(usuario, { ...datos, claveEntrega });
    await servicio.marcarLeida(usuario, primera.id);
    const repetida = await servicio.notificar(usuario, { ...datos, claveEntrega });
    expect(repetida.id).toBe(primera.id);
    expect(repetida.leida).toBe(true);
    expect(repetida.creadaEn).toBe(primera.creadaEn);
    expect(await servicio.contarNoLeidas(usuario)).toEqual({ cantidad: 0 });
  });
  it('el flujo de Nico sin clave conserva avisos independientes y distintos destinatarios', async () => {
    const primera = await servicio.notificar(usuario, datos);
    const segunda = await servicio.notificar(usuario, datos);
    expect(primera.id).not.toBe(segunda.id);
    expect(await servicio.contarNoLeidas(usuario)).toEqual({ cantidad: 2 });
    const otro = randomUUID();
    await servicio.notificar(otro, { ...datos, claveEntrega: `gasto:${randomUUID()}` });
    expect((await servicio.listar(usuario, null)).notificaciones).toHaveLength(2);
    expect((await servicio.listar(otro, null)).notificaciones).toHaveLength(1);
  });
});
