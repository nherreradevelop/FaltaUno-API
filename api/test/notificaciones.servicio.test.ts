import { AppError } from '../src/comun/errores';
import type { AvisadorEnVivo } from '../src/infra/tiempo-real';
import { Notificacion, type TipoNotificacion } from '../src/modulos/notificaciones/notificacion.entidad';
import type { DatosNotificacionNueva } from '../src/modulos/notificaciones/notificaciones.repositorio';
import {
  EVENTOS_EN_VIVO,
  NOTIFICACIONES_POR_PAGINA,
  NotificacionesServicio,
} from '../src/modulos/notificaciones/notificaciones.servicio';

const YO = 'usuario-yo';
const OTRO = 'usuario-otro';
const AHORA = new Date('2026-11-19T21:00:00.000Z');

/** Repositorio en memoria: los ids son números de 24 dígitos, así comparan igual que los ObjectId (más nuevo = mayor). */
class RepositorioEnMemoria {
  readonly guardadas: Notificacion[] = [];
  private siguiente = 1;

  agregar(usuarioId: string, opciones: { leida?: boolean; creadaEn?: Date; tipo?: TipoNotificacion } = {}): Notificacion {
    const id = String(this.siguiente++).padStart(24, '0');
    const notificacion = new Notificacion(
      id,
      usuarioId,
      opciones.tipo ?? 'actividadCancelada',
      `Aviso ${id}`,
      { tipo: 'actividad', id: 'actividad-1' },
      opciones.leida ?? false,
      opciones.creadaEn ?? AHORA,
    );
    this.guardadas.push(notificacion);
    return notificacion;
  }

  /** Igual que MongoDB: por fecha de creación (más nueva primero) y, a igual fecha, por id. */
  async listar(usuarioId: string, antesDe: string | null, cantidad: number): Promise<Notificacion[]> {
    const ordenadas = this.guardadas
      .filter((n) => n.usuarioId === usuarioId)
      .sort((a, b) => b.creadaEn.getTime() - a.creadaEn.getTime() || b.id.localeCompare(a.id));
    const desde = antesDe === null ? 0 : ordenadas.findIndex((n) => n.id === antesDe) + 1;
    return ordenadas.slice(desde, desde + cantidad);
  }

  async contarNoLeidas(usuarioId: string): Promise<number> {
    return this.guardadas.filter((n) => n.usuarioId === usuarioId && !n.leida).length;
  }

  async marcarLeida(usuarioId: string, id: string): Promise<boolean> {
    const indice = this.guardadas.findIndex((n) => n.id === id && n.usuarioId === usuarioId);
    if (indice === -1) return false;
    this.reemplazarComoLeida(indice);
    return true;
  }

  async marcarTodasLeidas(usuarioId: string, hasta: Date): Promise<void> {
    this.guardadas.forEach((n, indice) => {
      if (n.usuarioId === usuarioId && n.creadaEn <= hasta) this.reemplazarComoLeida(indice);
    });
  }

  async crear(usuarioId: string, datos: DatosNotificacionNueva, creadaEn: Date): Promise<Notificacion> {
    const id = String(this.siguiente++).padStart(24, '0');
    const notificacion = new Notificacion(id, usuarioId, datos.tipo, datos.texto, datos.destino, false, creadaEn);
    this.guardadas.push(notificacion);
    return notificacion;
  }

  private reemplazarComoLeida(indice: number): void {
    const n = this.guardadas[indice];
    this.guardadas[indice] = new Notificacion(n.id, n.usuarioId, n.tipo, n.texto, n.destino, true, n.creadaEn);
  }
}

/** Registra lo que se avisó en tiempo real. */
class AvisadorDePrueba implements AvisadorEnVivo {
  readonly avisos: { usuarioId: string; evento: string; datos: unknown }[] = [];
  emitirAUsuario(usuarioId: string, evento: string, datos: unknown): void {
    this.avisos.push({ usuarioId, evento, datos });
  }
}

function armar() {
  const repositorio = new RepositorioEnMemoria();
  const enVivo = new AvisadorDePrueba();
  const servicio = new NotificacionesServicio(repositorio, enVivo, () => AHORA);
  return { repositorio, enVivo, servicio };
}

describe('CU40 – Notificaciones', () => {
  it('FP: lista las notificaciones propias de la más reciente a la más antigua, sin las de otros usuarios (RN6)', async () => {
    const { repositorio, servicio } = armar();
    const vieja = repositorio.agregar(YO);
    repositorio.agregar(OTRO);
    const nueva = repositorio.agregar(YO, { leida: true });

    const pagina = await servicio.listar(YO, null);

    expect(pagina.notificaciones.map((n) => n.id)).toEqual([nueva.id, vieja.id]);
    expect(pagina.notificaciones[0]).toEqual({
      id: nueva.id,
      tipo: 'actividadCancelada',
      texto: `Aviso ${nueva.id}`,
      destino: { tipo: 'actividad', id: 'actividad-1' },
      leida: true,
      creadaEn: AHORA.toISOString(),
    });
    expect(pagina.hayMas).toBe(false);
  });

  it('FP: ordena por fecha de creación aunque se hayan guardado en otro orden', async () => {
    const { repositorio, servicio } = armar();
    const deHaceUnDia = repositorio.agregar(YO, { creadaEn: new Date('2026-11-18T21:00:00Z') });
    const deHaceUnaHora = repositorio.agregar(YO, { creadaEn: new Date('2026-11-19T20:00:00Z') });
    const deHaceUnaSemana = repositorio.agregar(YO, { creadaEn: new Date('2026-11-12T21:00:00Z') });

    const pagina = await servicio.listar(YO, null);

    expect(pagina.notificaciones.map((n) => n.id)).toEqual([deHaceUnaHora.id, deHaceUnDia.id, deHaceUnaSemana.id]);
  });

  it('A2: devuelve de a 20 y la página siguiente continúa sin repetir ni saltear notificaciones', async () => {
    const { repositorio, servicio } = armar();
    for (let i = 0; i < NOTIFICACIONES_POR_PAGINA + 5; i++) repositorio.agregar(YO);

    const primera = await servicio.listar(YO, null);
    const ultimaMostrada = primera.notificaciones[primera.notificaciones.length - 1].id;
    const segunda = await servicio.listar(YO, ultimaMostrada);

    expect(primera.notificaciones).toHaveLength(NOTIFICACIONES_POR_PAGINA);
    expect(primera.hayMas).toBe(true);
    expect(segunda.notificaciones).toHaveLength(5);
    expect(segunda.hayMas).toBe(false);
    const todas = [...primera.notificaciones, ...segunda.notificaciones].map((n) => n.id);
    expect(new Set(todas).size).toBe(NOTIFICACIONES_POR_PAGINA + 5);
  });

  it('E1: sin notificaciones devuelve una lista vacía y cero sin leer', async () => {
    const { servicio } = armar();
    await expect(servicio.listar(YO, null)).resolves.toEqual({ notificaciones: [], hayMas: false });
    await expect(servicio.contarNoLeidas(YO)).resolves.toEqual({ cantidad: 0 });
  });

  it('FP paso 1 / RN4: cuenta solo las no leídas del usuario', async () => {
    const { repositorio, servicio } = armar();
    repositorio.agregar(YO);
    repositorio.agregar(YO);
    repositorio.agregar(YO, { leida: true });
    repositorio.agregar(OTRO);

    await expect(servicio.contarNoLeidas(YO)).resolves.toEqual({ cantidad: 2 });
  });

  it('FP paso 6: marcar como leída actualiza el contador y lo avisa a los demás dispositivos del usuario', async () => {
    const { repositorio, enVivo, servicio } = armar();
    const notificacion = repositorio.agregar(YO);
    repositorio.agregar(YO);

    await expect(servicio.marcarLeida(YO, notificacion.id)).resolves.toEqual({ cantidad: 1 });
    expect(enVivo.avisos).toEqual([{ usuarioId: YO, evento: EVENTOS_EN_VIVO.noLeidas, datos: { cantidad: 1 } }]);
  });

  it('RN6: no permite marcar la notificación de otro usuario y responde como si no existiera', async () => {
    const { repositorio, enVivo, servicio } = armar();
    const ajena = repositorio.agregar(OTRO);

    const intento = servicio.marcarLeida(YO, ajena.id);

    await expect(intento).rejects.toBeInstanceOf(AppError);
    await expect(intento).rejects.toMatchObject({ estado: 404, codigo: 'NOTIFICACION_NO_ENCONTRADA' });
    expect(repositorio.guardadas[0].leida).toBe(false);
    expect(enVivo.avisos).toHaveLength(0);
  });

  it('A5: marcar una como leída sin abrirla solo cambia esa y conserva las demás', async () => {
    const { repositorio, servicio } = armar();
    const marcada = repositorio.agregar(YO);
    const otra = repositorio.agregar(YO);

    await expect(servicio.marcarLeida(YO, marcada.id)).resolves.toEqual({ cantidad: 1 });
    expect(repositorio.guardadas.map((n) => [n.id, n.leida])).toEqual([
      [marcada.id, true],
      [otra.id, false],
    ]);
  });

  it('A1: marcar todas como leídas no afecta las que llegaron después de pedirlo', async () => {
    const { repositorio, servicio } = armar();
    repositorio.agregar(YO, { creadaEn: new Date('2026-11-19T20:00:00Z') });
    repositorio.agregar(YO, { creadaEn: new Date('2026-11-19T20:30:00Z') });
    repositorio.agregar(YO, { creadaEn: new Date('2026-11-19T20:45:00Z') });

    const resultado = await servicio.marcarTodasLeidas(YO, new Date('2026-11-19T20:40:00Z'));

    expect(resultado).toEqual({ cantidad: 1 });
  });

  it('A3: una notificación nueva se guarda sin leer y se avisa al usuario con el contador actualizado', async () => {
    const { repositorio, enVivo, servicio } = armar();
    repositorio.agregar(YO);

    const creada = await servicio.notificar(YO, {
      tipo: 'invitacionRecibida',
      texto: 'Carla te invitó a "Surf en La Paloma".',
      destino: { tipo: 'actividad', id: 'actividad-1' },
    });

    expect(creada).toMatchObject({ tipo: 'invitacionRecibida', leida: false, creadaEn: AHORA.toISOString() });
    expect(enVivo.avisos).toEqual([
      { usuarioId: YO, evento: EVENTOS_EN_VIVO.nueva, datos: { notificacion: creada, noLeidas: 2 } },
    ]);
  });

  it('ER1: si falla la base al listar, el error se propaga y no se informa una lista vacía', async () => {
    const { repositorio, servicio } = armar();
    repositorio.listar = async () => {
      throw new Error('MongoDB no responde');
    };
    await expect(servicio.listar(YO, null)).rejects.toThrow('MongoDB no responde');
  });

  it('ER2: si falla la base al marcar como leída, no se avisa un contador que no se confirmó', async () => {
    const { repositorio, enVivo, servicio } = armar();
    const notificacion = repositorio.agregar(YO);
    repositorio.marcarLeida = async () => {
      throw new Error('MongoDB no responde');
    };
    await expect(servicio.marcarLeida(YO, notificacion.id)).rejects.toThrow('MongoDB no responde');
    expect(enVivo.avisos).toHaveLength(0);
  });
});
