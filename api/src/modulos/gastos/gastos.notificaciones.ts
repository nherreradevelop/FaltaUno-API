import type { PersonaGasto, ParteGasto } from './gasto.entidad';
import type { EventoGasto } from './gastos.eventos';

export const TEXTO_NOTIFICACION_GASTO: Record<EventoGasto['tipo'], string> = {
  gastoRegistrado: 'Se registró un gasto que te involucra. Revisá el reparto y los balances de la actividad.',
  gastoEditado: 'Se modificó un gasto en el que sos pagador o parte del reparto actual. Revisá los balances de la actividad.',
  gastoEliminado: 'Se eliminó un gasto que te involucraba. Su efecto se retiró de los balances de la actividad.',
};

/**
 * Ampliación solicitada de CU23–CU25: pagador y usuarios a quienes se asigna una parte positiva.
 * Los externos se imputan a su responsable (D3). En edición se usa solo el estado nuevo,
 * según la decisión expresa del usuario; el autor no recibe un aviso adicional por ser autor.
 */
export function destinatariosDeGasto(gasto: { pagadorId: string; partes: ParteGasto[] }, personas: PersonaGasto[]): string[] {
  const participaciones = new Set(
    gasto.partes.filter((parte) => parte.montoCentesimos > 0).map((parte) => parte.participacionId),
  );
  const pagador = personas.find((persona) => persona.id === gasto.pagadorId);
  if (pagador) participaciones.add(pagador.participacionId);
  return [
    ...new Set(
      personas
        .filter((persona) => participaciones.has(persona.participacionId))
        .map((persona) => persona.usuarioId)
        .filter((usuarioId): usuarioId is string => usuarioId !== null),
    ),
  ];
}
