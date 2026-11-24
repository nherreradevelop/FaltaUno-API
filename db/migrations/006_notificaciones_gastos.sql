-- CU23–CU25 + CU40: entrega durable al pagador y al reparto confirmados.
CREATE TABLE notificacion_gasto_pendiente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id UUID NOT NULL REFERENCES actividad(id) ON DELETE CASCADE,
  gasto_id UUID NOT NULL REFERENCES gasto(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo VARCHAR(32) NOT NULL CHECK (tipo IN ('gastoRegistrado','gastoEditado','gastoEliminado')),
  texto TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  notificada TIMESTAMPTZ,
  UNIQUE (gasto_id, version, usuario_id)
);
CREATE INDEX ix_notificacion_gasto_pendiente ON notificacion_gasto_pendiente (fecha, id)
  WHERE notificada IS NULL;
