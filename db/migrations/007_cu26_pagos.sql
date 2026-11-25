-- CU26 / RNF-16: historial durante seis meses calendario desde el archivo.
CREATE TABLE operacion_pago (
  actividad_id UUID NOT NULL REFERENCES actividad(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  clave VARCHAR(128) NOT NULL,
  huella CHAR(64) NOT NULL,
  respuesta JSONB NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actividad_id, usuario_id, clave)
);
CREATE INDEX ix_pago_historial_pagador ON pago (actividad_id,pagador_id,fecha_registro DESC,id DESC)
  WHERE fecha_eliminacion IS NULL;
CREATE INDEX ix_pago_historial_receptor ON pago (actividad_id,receptor_id,fecha_registro DESC,id DESC)
  WHERE fecha_eliminacion IS NULL;
CREATE INDEX ix_actividad_retencion_pagos ON actividad(fecha_archivado,id) WHERE estado='archivada';

-- Conserva solo el efecto acumulado para no recrear deudas al retirar el historial.
-- No conserva autor, fechas, versiones ni identificadores de pagos individuales.
CREATE TABLE pago_acumulado_archivado (
  actividad_id UUID NOT NULL REFERENCES actividad(id) ON DELETE CASCADE,
  pagador_id UUID NOT NULL REFERENCES participacion(id),
  receptor_id UUID NOT NULL REFERENCES participacion(id),
  monto NUMERIC(30,2) NOT NULL CHECK(monto>0),
  PRIMARY KEY(actividad_id,pagador_id,receptor_id)
);

-- Los clientes usan sesiones de la API; no acceden a estas tablas mediante PostgREST.
-- El propietario de las tablas (conexión backend) conserva su acceso.
DO $$
DECLARE tabla TEXT; rol TEXT;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['gasto','parte_gasto','pago','balance','operacion_gasto',
    'auditoria_gasto_pendiente','notificacion_gasto_pendiente','operacion_pago','pago_acumulado_archivado']
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',current_schema(),tabla);
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC',current_schema(),tabla);
    FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=rol) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %I',current_schema(),tabla,rol);
      END IF;
    END LOOP;
  END LOOP;
END $$;
