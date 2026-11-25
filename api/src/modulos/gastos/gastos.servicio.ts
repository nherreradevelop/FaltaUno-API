import { createHash, randomUUID } from 'node:crypto';
import { AppError, errores } from '../../comun/errores';
import type { Observable } from '../../comun/observable';
import { Gasto, type PersonaGasto } from './gasto.entidad';
import { esquemaCursorGasto, type AccionGasto, type DatosGasto, type OpcionesGasto, type ResultadoGasto } from './gastos.dto';
import type { EventoGasto } from './gastos.eventos';
import type { GastosRepositorio } from './gastos.repositorio';
import { destinatariosDeGasto, TEXTO_NOTIFICACION_GASTO } from './gastos.notificaciones';

const EVENTO_POR_ACCION: Record<AccionGasto, EventoGasto['tipo']> = {
  registrar: 'gastoRegistrado',
  editar: 'gastoEditado',
  eliminar: 'gastoEliminado',
};

export interface DependenciasGastos {
  repositorio: GastosRepositorio;
  transaccion: <T>(operacion: (repositorio: GastosRepositorio) => Promise<T>) => Promise<T>;
  eventos?: Pick<Observable<EventoGasto>, 'notificar'>;
  alFallarAuditoria: (error: unknown, datos: Record<string, unknown>) => void;
  ahora?: () => Date;
}

/** CU23–CU25: permisos, concurrencia e integridad de cada operación financiera. */
export class GastosServicio {
  constructor(private readonly dependencias: DependenciasGastos) {}

  async listar(usuarioId: string, actividadId: string, cursor?: string) {
    return this.dependencias.transaccion(async (repo) => {
      const opciones = await this.opcionesEn(repo, usuarioId, actividadId);
      let pagina;
      try {
        pagina = cursor ? esquemaCursorGasto.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString())) : undefined;
      } catch {
        throw errores.validacion({ cursor: 'La página solicitada no es válida.' });
      }
      return { ...(await repo.listar(actividadId, pagina)), opciones };
    });
  }

  async opciones(usuarioId: string, actividadId: string) {
    return this.dependencias.transaccion((repo) => this.opcionesEn(repo, usuarioId, actividadId));
  }

  async detalle(usuarioId: string, actividadId: string, gastoId: string) {
    return this.dependencias.transaccion(async (repo) => {
      await this.autorizar(repo, usuarioId, actividadId, false);
      const gasto = await repo.detalle(actividadId, gastoId);
      if (!gasto || gasto.eliminado) throw noDisponible();
      return gasto;
    });
  }

  async balances(usuarioId: string, actividadId: string) {
    return this.dependencias.transaccion(async (repo) => {
      await this.autorizar(repo, usuarioId, actividadId, false);
      return repo.balances(actividadId);
    });
  }

  /** RNF-10: consulta serializada con la escritura del mismo intento. El reenvío siempre conserva su clave. */
  async consultarOperacion(usuarioId: string, actividadId: string, clave: string) {
    return this.dependencias.transaccion(async (repo) => {
      await repo.bloquearOperacion(actividadId, usuarioId, clave);
      await this.autorizar(repo, usuarioId, actividadId, false);
      const operacion = await repo.operacion(actividadId, usuarioId, clave);
      return operacion ? { estado: 'confirmada' as const, resultado: operacion.respuesta } : { estado: 'noRegistrada' as const };
    });
  }

  /** CU23 FP / CU24 FP / CU25 FP. La respuesta se persiste en la misma transacción que el balance. */
  async ejecutar(
    usuarioId: string,
    actividadId: string,
    clave: string,
    accion: AccionGasto,
    datos: DatosGasto | null,
    gastoId?: string,
    version?: number,
  ): Promise<ResultadoGasto> {
    const canonicos = datos ? { ...datos, participantes: [...datos.participantes].sort() } : null;
    const huella = createHash('sha256')
      .update(JSON.stringify({ accion, gastoId: gastoId ?? null, version: version ?? null, datos: canonicos }))
      .digest('hex');
    let evento: EventoGasto | undefined;
    try {
      const resultado = await this.dependencias.transaccion(async (repo) => {
        await repo.bloquearOperacion(actividadId, usuarioId, clave);
        const actividad = await this.autorizar(repo, usuarioId, actividadId, true);
        const previa = await repo.operacion(actividadId, usuarioId, clave);
        if (previa) {
          if (previa.huella !== huella)
            throw new AppError(409, 'INTENTO_MODIFICADO', 'Ese intento corresponde a otros datos. Verificá su resultado.');
          return previa.respuesta;
        }
        const motivo = this.motivo(actividad);
        if (motivo) throw new AppError(409, 'ACTIVIDAD_NO_ADMITE_GASTOS', motivo);
        const anterior = gastoId ? await repo.detalle(actividadId, gastoId) : null;
        if (accion !== 'registrar') {
          if (!anterior || anterior.eliminado) throw noDisponible();
          if (anterior.registradoPorId !== actividad.participacion_id) {
            throw errores.prohibido('GASTO_SIN_PERMISO', 'Solo quien registró el gasto puede modificarlo o eliminarlo.');
          }
          if (anterior.version !== version)
            throw new AppError(
              409,
              'GASTO_MODIFICADO',
              'Este gasto cambió desde que lo abriste. Revisá los valores actuales antes de continuar.',
            );
        }
        const id = gastoId ?? randomUUID();
        const personas = await repo.personas(actividadId);
        let sinCambios = false;
        if (accion === 'eliminar') await repo.eliminar(id);
        else {
          if (!datos) throw errores.validacion({ cuerpo: 'Faltan los datos del gasto.' });
          const seleccionadas = datos.participantes.map((personaId) => this.persona(personas, personaId, 'participantes'));
          const pagador = this.persona(personas, datos.pagadorId, 'pagadorId');
          const partes = new Gasto(datos.montoCentesimos, seleccionadas).repartir();
          sinCambios =
            anterior !== null &&
            anterior.concepto === datos.concepto &&
            anterior.montoCentesimos === datos.montoCentesimos &&
            anterior.pagadorId === datos.pagadorId &&
            JSON.stringify(anterior.partes.map((p) => p.personaId).sort()) === JSON.stringify([...datos.participantes].sort());
          if (!sinCambios)
            await repo.guardar(id, actividadId, actividad.participacion_id!, datos, pagador, partes, accion === 'registrar');
        }
        if (!sinCambios) await repo.recalcular(actividadId);
        const gasto = await repo.detalle(actividadId, id);
        if (!gasto) throw new Error('No se recuperó el gasto tras guardarlo.');
        const respuesta = { gasto, sinCambios };
        await repo.confirmarOperacion(actividadId, usuarioId, clave, huella, respuesta);
        const tipo = EVENTO_POR_ACCION[accion];
        const cambio: EventoGasto = { tipo, actividadId, gastoId: id, usuarioId };
        if (!sinCambios) {
          await repo.encolarNotificaciones(gasto, destinatariosDeGasto(gasto, personas), tipo, TEXTO_NOTIFICACION_GASTO[tipo]);
          evento = cambio;
        }
        await repo.auditar({
          ...cambio,
          accion,
          fecha: this.ahora().toISOString(),
          resultado: sinCambios ? 'sinCambios' : 'confirmada',
        });
        return respuesta;
      });
      // El commit ya ocurrió: los observadores nunca cambian el resultado financiero.
      if (evento) this.dependencias.eventos?.notificar(evento);
      return resultado;
    } catch (error) {
      await this.auditarFallo(error, { actividadId, usuarioId, gastoId: gastoId ?? null, accion });
      throw error;
    }
  }

  private async opcionesEn(repo: GastosRepositorio, usuarioId: string, actividadId: string): Promise<OpcionesGasto> {
    const actividad = await this.autorizar(repo, usuarioId, actividadId, false);
    const motivo = this.motivo(actividad);
    return {
      personas: await repo.personas(actividadId),
      puedeEscribir: motivo === null,
      motivo,
      participacionActualId: actividad.participacion_id!,
    };
  }

  private async autorizar(repo: GastosRepositorio, usuarioId: string, actividadId: string, bloquear: boolean) {
    const actividad = await repo.actividad(actividadId, usuarioId, bloquear);
    if (!actividad) throw errores.noEncontrado('ACTIVIDAD_NO_DISPONIBLE', 'La actividad no está disponible.');
    if (!actividad.participacion_id)
      throw errores.prohibido('GASTOS_SIN_PERMISO', 'Tenés que participar en la actividad para acceder a sus gastos.');
    return actividad;
  }

  private motivo(actividad: { estado: string; inicio: Date }): string | null {
    if (actividad.estado === 'programada') return 'Los gastos podrán registrarse cuando la actividad se inicie.';
    if (actividad.estado !== 'iniciada') return 'Esta actividad ya no admite cambios en sus gastos.';
    if (this.ahora().getTime() >= actividad.inicio.getTime() + 14 * 24 * 60 * 60 * 1000)
      return 'Terminó el plazo de 14 días para modificar los gastos.';
    return null;
  }

  private persona(personas: PersonaGasto[], id: string, campo: string): PersonaGasto {
    const persona = personas.find((p) => p.id === id);
    if (!persona) throw errores.validacion({ [campo]: 'Seleccioná personas que pertenezcan a la actividad.' });
    return persona;
  }

  private ahora(): Date {
    return this.dependencias.ahora?.() ?? new Date();
  }

  private async auditarFallo(error: unknown, datos: Record<string, unknown>): Promise<void> {
    const evento = {
      ...datos,
      fecha: this.ahora().toISOString(),
      resultado: error instanceof AppError ? 'rechazada' : 'fallida',
      codigo: error instanceof AppError ? error.codigo : 'ERROR_INTERNO',
    };
    try {
      await this.dependencias.repositorio.auditar(evento);
    } catch (fallo) {
      this.dependencias.alFallarAuditoria(fallo, evento);
    }
  }
}

function noDisponible() {
  return errores.noEncontrado(
    'GASTO_NO_DISPONIBLE',
    'Este gasto fue eliminado o ya no está disponible. Actualizá la lista y los balances.',
  );
}
