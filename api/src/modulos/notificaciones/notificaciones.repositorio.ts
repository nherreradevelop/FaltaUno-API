import { ObjectId, type Collection, type Db, type Filter } from 'mongodb';
import { Notificacion, type DestinoNotificacion, type TipoNotificacion } from './notificacion.entidad';

const NOMBRE_COLECCION = 'notificaciones';

/** Documento tal como se guarda en MongoDB. El id es un ObjectId: ordena por fecha de creación. */
interface DocumentoNotificacion {
  _id: ObjectId;
  usuarioId: string;
  tipo: TipoNotificacion;
  texto: string;
  destino: DestinoNotificacion | null;
  leida: boolean;
  creadaEn: Date;
  claveEntrega?: string;
}

export interface DatosNotificacionNueva {
  tipo: TipoNotificacion;
  texto: string;
  destino: DestinoNotificacion | null;
  /** Correlación interna opcional para reentregas durables; nunca se expone en el DTO. */
  claveEntrega?: string;
}

function aNotificacion(documento: DocumentoNotificacion): Notificacion {
  return new Notificacion(
    documento._id.toHexString(),
    documento.usuarioId,
    documento.tipo,
    documento.texto,
    documento.destino,
    documento.leida,
    documento.creadaEn,
  );
}

/** Notificaciones en MongoDB ↔ entidades. */
export class NotificacionesRepositorio {
  private readonly coleccion: Collection<DocumentoNotificacion>;
  private indiceEntrega?: Promise<string>;

  constructor(db: Db) {
    this.coleccion = db.collection<DocumentoNotificacion>(NOMBRE_COLECCION);
  }

  /**
   * Índices de la colección. Se crean al arrancar la API; si ya existen, MongoDB no hace nada.
   * - Lista paginada de un usuario, de la más nueva a la más vieja por fecha de creación (FP paso 3, A2);
   *   el _id desempata dos notificaciones creadas en el mismo milisegundo.
   * - Contador de no leídas (FP paso 1, RN4).
   * - TTL: MongoDB borra solo las notificaciones con más días que la retención (RN8, RNF-16).
   */
  async crearIndices(diasDeRetencion: number): Promise<void> {
    await this.asegurarIndiceEntrega();
    await this.coleccion.createIndexes([
      { key: { usuarioId: 1, creadaEn: -1, _id: -1 }, name: 'ix_usuario_creada_en' },
      { key: { usuarioId: 1, leida: 1 }, name: 'ix_usuario_leida' },
      { key: { creadaEn: 1 }, name: 'ttl_creada_en', expireAfterSeconds: diasDeRetencion * 24 * 60 * 60 },
    ]);
  }

  /**
   * Notificaciones del usuario de la más nueva a la más vieja. Con "antesDe" (id de la última ya mostrada)
   * devuelve las que siguen a esa (A2). Si esa notificación ya no existe (venció, RN8), empieza desde el principio.
   */
  async listar(usuarioId: string, antesDe: string | null, cantidad: number): Promise<Notificacion[]> {
    const filtro = await this.filtroDePagina(usuarioId, antesDe);
    const documentos = await this.coleccion.find(filtro).sort({ creadaEn: -1, _id: -1 }).limit(cantidad).toArray();
    return documentos.map(aNotificacion);
  }

  /** Filtro para seguir después de "antesDe": más viejas que ella, o igual de viejas con un _id menor. */
  private async filtroDePagina(usuarioId: string, antesDe: string | null): Promise<Filter<DocumentoNotificacion>> {
    if (antesDe === null) {
      return { usuarioId };
    }
    const idAnterior = new ObjectId(antesDe);
    const anterior = await this.coleccion.findOne({ _id: idAnterior, usuarioId }, { projection: { creadaEn: 1 } });
    if (anterior === null) {
      return { usuarioId };
    }
    return {
      usuarioId,
      $or: [{ creadaEn: { $lt: anterior.creadaEn } }, { creadaEn: anterior.creadaEn, _id: { $lt: idAnterior } }],
    };
  }

  async contarNoLeidas(usuarioId: string): Promise<number> {
    return this.coleccion.countDocuments({ usuarioId, leida: false });
  }

  /** Marca como leída una notificación del usuario. Devuelve false si no existe o es de otro usuario (RN6). */
  async marcarLeida(usuarioId: string, id: string): Promise<boolean> {
    const resultado = await this.coleccion.updateOne({ _id: new ObjectId(id), usuarioId }, { $set: { leida: true } });
    return resultado.matchedCount === 1;
  }

  /** A1: marca como leídas las recibidas hasta ese momento; las que lleguen después siguen sin leer. */
  async marcarTodasLeidas(usuarioId: string, hasta: Date): Promise<void> {
    await this.coleccion.updateMany({ usuarioId, leida: false, creadaEn: { $lte: hasta } }, { $set: { leida: true } });
  }

  async crear(usuarioId: string, datos: DatosNotificacionNueva, creadaEn: Date): Promise<Notificacion> {
    const documento: DocumentoNotificacion = {
      _id: new ObjectId(),
      usuarioId,
      tipo: datos.tipo,
      texto: datos.texto,
      destino: datos.destino,
      leida: false,
      creadaEn,
    };
    if (datos.claveEntrega) {
      await this.asegurarIndiceEntrega();
      documento.claveEntrega = datos.claveEntrega;
      const filtro = { usuarioId, claveEntrega: datos.claveEntrega };
      try {
        await this.coleccion.updateOne(filtro, { $setOnInsert: documento }, { upsert: true });
      } catch (error) {
        // Dos instancias pueden intentar la misma entrega: el índice único decide cuál inserta.
        if ((error as { code?: number }).code !== 11000) throw error;
      }
      const guardada = await this.coleccion.findOne(filtro);
      if (!guardada) throw new Error('No se pudo recuperar la notificación de la entrega confirmada.');
      return aNotificacion(guardada);
    }
    await this.coleccion.insertOne(documento);
    return aNotificacion(documento);
  }

  private async asegurarIndiceEntrega(): Promise<string> {
    this.indiceEntrega ??= this.coleccion.createIndex(
      { claveEntrega: 1 },
      { name: 'uk_clave_entrega', unique: true, sparse: true },
    );
    try {
      return await this.indiceEntrega;
    } catch (error) {
      this.indiceEntrega = undefined;
      throw error;
    }
  }
}
