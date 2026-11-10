-- FaltaUno - índice para la búsqueda de actividades (CU08)
-- Los cupos ocupados se cuentan por actividad en cada búsqueda. El índice único uk_participacion
-- es parcial (solo filas con usuario), así que no sirve para contar todas las participaciones.
CREATE INDEX IF NOT EXISTS ix_participacion_actividad ON participacion (actividad_id);
