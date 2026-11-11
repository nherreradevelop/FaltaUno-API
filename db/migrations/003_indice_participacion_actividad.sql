-- CU09: el detalle cuenta los cupos ocupados y lista los participantes de una actividad.
-- uk_participacion es parcial (usuario_id IS NOT NULL) y no sirve para esas búsquedas,
-- que también incluyen las participaciones de cuentas cerradas (CU33).
CREATE INDEX ix_participacion_actividad ON participacion (actividad_id);
