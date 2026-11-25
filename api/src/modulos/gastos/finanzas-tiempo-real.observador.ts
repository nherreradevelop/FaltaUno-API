import type { AvisadorEnVivo } from '../../infra/tiempo-real';
import type { FinanzasTiempoRealRepositorio } from './finanzas-tiempo-real.repositorio';

/** CU23–CU26: invalida las vistas después del commit, sin publicar el historial privado de pagos. */
export class FinanzasTiempoRealObservador {
  constructor(
    private readonly repositorio: Pick<FinanzasTiempoRealRepositorio, 'participantes'>,
    private readonly avisador: AvisadorEnVivo,
  ) {}

  async actualizar({ actividadId }: { actividadId: string }): Promise<void> {
    const usuarios = await this.repositorio.participantes(actividadId);
    for (const usuarioId of usuarios) {
      // Todos pueden consultar los balances; cada GET de pagos sigue filtrando por las dos partes.
      this.avisador.emitirAUsuario(usuarioId, 'finanzas:actualizadas', { actividadId });
    }
  }
}
