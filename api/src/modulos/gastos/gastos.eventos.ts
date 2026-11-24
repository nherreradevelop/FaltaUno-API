export interface EventoGasto {
  tipo: 'gastoRegistrado' | 'gastoEditado' | 'gastoEliminado';
  actividadId: string;
  gastoId: string;
  usuarioId: string;
}
