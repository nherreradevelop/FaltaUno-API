-- CU10: ajuste solicitado el 10/11/2026. No sustituye migraciones ya aplicadas.
BEGIN;
ALTER TABLE actividad
  ALTER COLUMN origen_direccion DROP NOT NULL,
  ALTER COLUMN origen_lat DROP NOT NULL,
  ALTER COLUMN origen_lng DROP NOT NULL,
  ALTER COLUMN destino_lat TYPE NUMERIC(18,14),
  ALTER COLUMN destino_lng TYPE NUMERIC(18,14),
  ADD COLUMN destino_provisional BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT ck_actividad_origen_completo
    CHECK (num_nonnulls(origen_direccion, origen_lat, origen_lng) IN (0, 3));
COMMIT;
