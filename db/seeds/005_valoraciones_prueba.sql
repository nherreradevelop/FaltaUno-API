-- FaltaUno - datos de prueba para el CU21 (Sistema de valoración de usuarios)
-- SOLO para desarrollo local. Requiere 001_usuarios_prueba.sql y 003_detalle_actividad_prueba.sql
-- (cargar este después: 003 borra y vuelve a crear sus actividades). Se puede ejecutar varias veces.
--
-- Entrando como armanelian@gmail.com (Elian):
--   ...9100-000000000004  Surf en Punta del Diablo, Iniciada: organiza Carla; participan Elian, Diego y Bruno.
--                         Elian ya valoró a Diego (4 estrellas, con comentario): Carla y Bruno quedan pendientes.
--                         -> FP, A1 (pendientes) y A2 (cambiar la valoración de Diego)
--   ...9100-000000000006  Vóley en Playa Ramírez, Archivada: organiza Elian; participa Diego, sin valorar
--                         -> se puede valorar en una actividad archivada
--   ...9100-000000000003  Trekking en el Pan de Azúcar, Programada, Elian participa
--                         -> E2: "Vas a poder valorar a los participantes cuando la actividad se inicie."

INSERT INTO participacion (actividad_id, usuario_id, es_organizador, fecha_union) VALUES
  ('00000000-0000-4000-9100-000000000004', '00000000-0000-4000-8000-000000000004', FALSE, now() - interval '7 days'),
  ('00000000-0000-4000-9100-000000000004', '00000000-0000-4000-8000-000000000002', FALSE, now() - interval '6 days')
ON CONFLICT (actividad_id, usuario_id) WHERE usuario_id IS NOT NULL DO NOTHING;

DELETE FROM valoracion
WHERE evaluador_id = '00000000-0000-4000-8000-000000000001'
  AND actividad_id IN ('00000000-0000-4000-9100-000000000004', '00000000-0000-4000-9100-000000000006');

INSERT INTO valoracion (actividad_id, evaluador_id, evaluado_id, puntaje, comentario)
VALUES ('00000000-0000-4000-9100-000000000004', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000004', 4, 'Muy puntual y buena onda en el agua.');
