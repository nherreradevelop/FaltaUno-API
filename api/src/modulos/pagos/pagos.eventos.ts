export interface EventoPago {
  tipo: 'pagoRegistrado' | 'pagoEditado' | 'pagoEliminado';
  actividadId: string;
  pagoId: string;
  usuarioId: string;
}
