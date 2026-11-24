-- CU23–CU25: identidad del pagador externo, reintentos durables y salida de auditoría.
ALTER TABLE gasto ADD COLUMN pagado_por_invitado_id UUID REFERENCES invitado_externo(id);
CREATE UNIQUE INDEX uk_parte_gasto_participante ON parte_gasto (gasto_id, participacion_id)
  WHERE invitado_externo_id IS NULL;
CREATE UNIQUE INDEX uk_parte_gasto_invitado ON parte_gasto (gasto_id, invitado_externo_id)
  WHERE invitado_externo_id IS NOT NULL;
CREATE INDEX ix_gasto_pagina ON gasto (actividad_id, fecha_registro DESC, id DESC)
  WHERE fecha_eliminacion IS NULL;
CREATE TABLE operacion_gasto (
  actividad_id UUID NOT NULL REFERENCES actividad(id),
  usuario_id UUID NOT NULL REFERENCES usuario(id),
  clave VARCHAR(128) NOT NULL,
  huella CHAR(64) NOT NULL,
  respuesta JSONB NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actividad_id, usuario_id, clave)
);
CREATE TABLE auditoria_gasto_pendiente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento JSONB NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  entregada TIMESTAMPTZ
);
CREATE INDEX ix_auditoria_gasto_pendiente ON auditoria_gasto_pendiente (fecha) WHERE entregada IS NULL;
