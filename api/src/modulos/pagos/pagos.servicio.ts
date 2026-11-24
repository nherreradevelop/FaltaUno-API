import { createHash, randomUUID } from 'node:crypto';
import { AppError, errores } from '../../comun/errores';
import { esquemaCursorGasto } from '../gastos/gastos.dto';
import { Pago } from './pago.entidad';
import type { AccionPago, DatosPago, OpcionesPago, PagoDto, ResultadoPago } from './pagos.dto';
import type { PagosRepositorio } from './pagos.repositorio';
import type { Observable } from '../../comun/observable';
import type { EventoPago } from './pagos.eventos';

const EVENTO_POR_ACCION: Record<AccionPago, EventoPago['tipo']> = {
  registrar: 'pagoRegistrado',
  editar: 'pagoEditado',
  eliminar: 'pagoEliminado',
};

export interface DependenciasPagos {
  repositorio: PagosRepositorio;
  transaccion: <T>(operacion: (repo: PagosRepositorio) => Promise<T>) => Promise<T>;
  alFallarAuditoria: (error: unknown) => void;
  eventos?: Pick<Observable<EventoPago>, 'notificar'>;
}

/** CU26, CU24 y CU25: deuda vigente, permisos de las dos partes e integridad transaccional. */
export class PagosServicio {
  constructor(private readonly deps: DependenciasPagos) {}

  async listar(usuarioId: string, actividadId: string, cursor?: string) {
    return this.deps.transaccion(async (repo) => {
      const opciones = await this.opcionesEn(repo, usuarioId, actividadId);
      let pagina;
      try {
        pagina = cursor ? esquemaCursorGasto.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString())) : undefined;
      } catch {
        throw errores.validacion({ cursor: 'La página solicitada no es válida.' });
      }
      if (opciones.historialVencido) return { pagos: [], siguienteCursor: null, opciones };
      return { ...(await repo.listar(actividadId, opciones.participacionActualId, pagina)), opciones };
    });
  }

  async opciones(usuarioId: string, actividadId: string) {
    return this.deps.transaccion((repo) => this.opcionesEn(repo, usuarioId, actividadId));
  }

  async detalle(usuarioId: string, actividadId: string, pagoId: string) {
    return this.deps.transaccion(async (repo) => {
      const a = await this.autorizar(repo, usuarioId, actividadId, false);
      await this.validarRetencion(repo, actividadId);
      const pago = await repo.detalle(actividadId, pagoId);
      this.validarAcceso(pago, a.participacion_id!);
      const balances = await repo.balances.calcular(actividadId, pagoId);
      const maximo =
        balances.find((b) => b.deudorId === pago!.pagadorId && b.acreedorId === pago!.receptorId)?.montoCentesimos ?? 0;
      return { ...pago!, maximoCentesimos: maximo };
    });
  }

  async consultarOperacion(usuarioId: string, actividadId: string, clave: string) {
    return this.deps.transaccion(async (repo) => {
      await repo.bloquearOperacion(actividadId, usuarioId, clave);
      await this.autorizar(repo, usuarioId, actividadId, false);
      await this.validarRetencion(repo, actividadId);
      const previa = await repo.operacion(actividadId, usuarioId, clave);
      return previa ? { estado: 'confirmada' as const, resultado: previa.respuesta } : { estado: 'noRegistrada' as const };
    });
  }

  /** CU26 FP/ER1/RNF-23: pago, balance y respuesta durable se confirman juntos. */
  async ejecutar(
    usuarioId: string,
    actividadId: string,
    clave: string,
    accion: AccionPago,
    datos: DatosPago | null,
    pagoId?: string,
    version?: number,
  ): Promise<ResultadoPago> {
    const huella = createHash('sha256')
      .update(
        JSON.stringify({
          accion,
          pagoId: pagoId ?? null,
          version: version ?? null,
          datos: datos
            ? { montoCentesimos: datos.montoCentesimos, pagadorId: datos.pagadorId ?? null, receptorId: datos.receptorId ?? null }
            : null,
        }),
      )
      .digest('hex');
    let evento: EventoPago | undefined;
    try {
      const resultado = await this.deps.transaccion(async (repo) => {
        await repo.bloquearOperacion(actividadId, usuarioId, clave);
        const actividad = await this.autorizar(repo, usuarioId, actividadId, true);
        await this.validarRetencion(repo, actividadId);
        const previa = await repo.operacion(actividadId, usuarioId, clave);
        if (previa) {
          if (previa.huella !== huella)
            throw new AppError(409, 'INTENTO_MODIFICADO', 'Ese intento corresponde a otros datos. Verificá su resultado.');
          return previa.respuesta;
        }
        // CU26 RN6 y glosario: Iniciada dura 14 días, aunque aún no se haya ejecutado CU32.
        const motivo = motivoPago(actividad);
        if (motivo) throw new AppError(409, 'ACTIVIDAD_NO_ADMITE_PAGOS', motivo);
        const autor = actividad.participacion_id!;
        const anterior = pagoId ? await repo.detalle(actividadId, pagoId) : null;
        if (accion !== 'registrar') {
          this.validarAcceso(anterior, autor);
          if (anterior!.registradoPorId !== autor)
            throw errores.prohibido('PAGO_SIN_PERMISO', 'Solo quien registró el pago puede modificarlo o eliminarlo.');
          if (anterior!.version !== version)
            throw new AppError(
              409,
              'PAGO_MODIFICADO',
              'Este pago cambió desde que lo abriste. Revisá la versión actual antes de confirmar.',
            );
        }
        const id = pagoId ?? randomUUID();
        let sinCambios = false;
        if (accion === 'eliminar') await repo.eliminar(id);
        else {
          const pagador = anterior?.pagadorId ?? datos?.pagadorId;
          const receptor = anterior?.receptorId ?? datos?.receptorId;
          if (!pagador || !receptor || pagador === receptor || (autor !== pagador && autor !== receptor))
            throw errores.prohibido('PAGO_SIN_PERMISO', 'Solo quien pagó o quien cobró puede registrar este pago.');
          const personas = await repo.gastos.personas(actividadId);
          const registrados = new Set(personas.filter((p) => !p.invitadoId && p.usuarioId).map((p) => p.participacionId));
          if (!registrados.has(pagador) || !registrados.has(receptor))
            throw errores.validacion({ participantes: 'Ambas partes deben participar en la actividad.' });
          // CU24 RN9: al editar se calcula el máximo retirando primero el efecto anterior.
          const balances = await repo.balances.calcular(actividadId, anterior?.id);
          const deuda = balances.find((b) => b.deudorId === pagador && b.acreedorId === receptor)?.montoCentesimos ?? 0;
          const monto = typeof datos?.montoCentesimos === 'number' ? datos.montoCentesimos : NaN;
          new Pago(monto).validar(deuda);
          sinCambios = anterior?.montoCentesimos === monto;
          if (!sinCambios) await repo.guardar(id, actividadId, autor, pagador, receptor, monto, accion === 'registrar');
        }
        if (!sinCambios) await repo.balances.recalcular(actividadId);
        const pago = await repo.detalle(actividadId, id);
        if (!pago) throw new Error('No se recuperó el pago después de guardarlo.');
        const respuesta = { pago, sinCambios };
        await repo.confirmar(actividadId, usuarioId, clave, huella, respuesta);
        // Auditoría sin importes ni copias del historial; el observador existente la entrega tras el commit.
        await repo.gastos.auditar({
          tipo: 'pago',
          accion,
          actividadId,
          pagoId: id,
          usuarioId,
          fecha: new Date().toISOString(),
          resultado: sinCambios ? 'sinCambios' : 'confirmada',
        });
        if (!sinCambios) evento = { tipo: EVENTO_POR_ACCION[accion], actividadId, pagoId: id, usuarioId };
        return respuesta;
      });
      // Solo después del commit: un rollback, un reenvío o una edición sin cambios no emiten eventos.
      if (evento) this.deps.eventos?.notificar(evento);
      return resultado;
    } catch (error) {
      try {
        await this.deps.repositorio.gastos.auditar({
          tipo: 'pago',
          accion,
          actividadId,
          pagoId: pagoId ?? null,
          usuarioId,
          fecha: new Date().toISOString(),
          resultado: error instanceof AppError ? 'rechazada' : 'fallida',
          codigo: error instanceof AppError ? error.codigo : 'ERROR_INTERNO',
        });
      } catch (fallo) {
        this.deps.alFallarAuditoria(fallo);
      }
      throw error;
    }
  }

  private async autorizar(repo: PagosRepositorio, usuarioId: string, actividadId: string, bloquear: boolean) {
    const a = await repo.gastos.actividad(actividadId, usuarioId, bloquear);
    if (!a) throw errores.noEncontrado('ACTIVIDAD_NO_DISPONIBLE', 'La actividad no está disponible.');
    if (!a.participacion_id)
      throw errores.prohibido('PAGOS_SIN_PERMISO', 'Tenés que participar en la actividad para acceder a sus pagos.');
    return a;
  }
  private validarAcceso(pago: PagoDto | null, participante: string) {
    if (!pago || pago.eliminado || (pago.pagadorId !== participante && pago.receptorId !== participante))
      throw errores.noEncontrado('PAGO_NO_DISPONIBLE', 'Este pago no está disponible. Actualizá la lista y los balances.');
  }
  private async validarRetencion(repo: PagosRepositorio, actividadId: string) {
    if ((await repo.retencion(actividadId)).vencido)
      throw new AppError(
        410,
        'HISTORIAL_PAGOS_VENCIDO',
        'El historial de pagos venció: se conserva seis meses desde el archivo de la actividad.',
      );
  }
  private async opcionesEn(repo: PagosRepositorio, usuarioId: string, actividadId: string): Promise<OpcionesPago> {
    const a = await this.autorizar(repo, usuarioId, actividadId, false);
    const retencion = await repo.retencion(actividadId);
    const balances = await repo.gastos.balances(actividadId);
    return {
      personas: await repo.gastos.personas(actividadId),
      participacionActualId: a.participacion_id!,
      puedeEscribir: motivoPago(a) === null,
      motivo: motivoPago(a),
      deudas: balances.filter((b) => b.deudorId === a.participacion_id || b.acreedorId === a.participacion_id),
      historialVencido: retencion.vencido,
      historialHasta: retencion.hasta?.toISOString() ?? null,
    };
  }
}

function motivoPago({ estado, inicio }: { estado: string; inicio: Date }): string | null {
  if (estado === 'iniciada') {
    if (Date.now() >= inicio.getTime() + 14 * 24 * 60 * 60 * 1000)
      return 'Terminó el plazo de 14 días para registrar o modificar pagos.';
    return null;
  }
  if (estado === 'archivada') return 'La actividad está archivada y ya no admite pagos.';
  return 'Solo se pueden registrar pagos mientras la actividad está iniciada.';
}
