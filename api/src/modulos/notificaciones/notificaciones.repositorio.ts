import { ObjectId, type Collection, type Db } from 'mongodb';
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
}

export interface DatosNotificacionNueva {
  tipo: TipoNotificacion;
  texto: string;
  destino: DestinoNotificacion | null;
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

  constructor(db: Db) {
    this.coleccion = db.collection<DocumentoNotificacion>(NOMBRE_COLECCION);
  }

  /**
   * Índices de la colección. Se crean al arrancar la API; si ya existen, MongoDB no hace nada.
   * - Lista paginada de un usuario, de la más nueva a la más vieja (FP paso 3, A2).
   * - Contador de no leídas (FP paso 1, RN4).
   * - TTL: MongoDB borra solo las notificaciones con más días que la retención (RN8, RNF-16).
   */
  async crearIndices(diasDeRetencion: number): Promise<void> {
    await this.coleccion.createIndexes([
      { key: { usuarioId: 1, _id: -1 }, name: 'ix_usuario_recientes' },
      { key: { usuarioId: 1, leida: 1 }, name: 'ix_usuario_leida' },
      { key: { creadaEn: 1 }, name: 'ttl_creada_en', expireAfterSeconds: diasDeRetencion * 24 * 60 * 60 },
    ]);
  }

  /** Notificaciones del usuario más viejas que "antesDe" (o las más nuevas si es null). */
  async listar(usuarioId: string, antesDe: string | null, cantidad: number): Promise<Notificacion[]> {
    const filtro = antesDe === null ? { usuarioId } : { usuarioId, _id: { $lt: new ObjectId(antesDe) } };
    const documentos = await this.coleccion.find(filtro).sort({ _id: -1 }).limit(cantidad).toArray();
    return documentos.map(aNotificacion);
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
    await this.coleccion.insertOne(documento);
    return aNotificacion(documento);
  }
}
