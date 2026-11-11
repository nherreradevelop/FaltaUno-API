-- FaltaUno - datos de prueba para el CU09 (Detalle de actividad)
-- SOLO para desarrollo local. Requiere 001_usuarios_prueba.sql y la migración 003.
-- Se puede ejecutar varias veces: borra y vuelve a crear estas actividades.
--
-- Entrando como armanelian@gmail.com (Elian), abrir /actividades/<id>:
--   ...9100-000000000001  Programada, organiza Carla, Elian NO participa, con pronóstico,
--                         costo e invitados externos            -> FP como "ninguno": ofrece Unirse
--   ...9100-000000000002  Programada, organiza Elian             -> opciones del organizador
--   ...9100-000000000003  Programada, organiza Carla, Elian participa -> opciones del participante
--   ...9100-000000000004  Iniciada hace 2 días, Elian participa, sin pronóstico
--                                                                -> RN4 fecha límite y "Pronóstico no disponible"
--   ...9100-000000000005  Cancelada, Elian no participa          -> E1: estado cancelada, sin Unirse
--   ...9100-000000000006  Archivada, organiza Elian              -> RN5 solo lectura
--   ...9100-000000000007  Programada y completa (cupo 2: Carla + 1 invitado) -> no ofrece Unirse
--   ...9100-000000000099  no existe                              -> E2

DELETE FROM actividad WHERE id::text LIKE '00000000-0000-4000-9100-%';

INSERT INTO actividad (id, organizador_id, deporte_id, nombre, descripcion, fecha_hora_inicio, cupo_maximo, nivel,
                       origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng,
                       departamento, costo_estimado, estado, motivo_cancelacion, fecha_cancelacion, fecha_archivado)
VALUES
  ('00000000-0000-4000-9100-000000000001', '00000000-0000-4000-8000-000000000003', (SELECT id FROM deporte WHERE nombre = 'Surf'),
   'Surf en La Paloma', 'Salimos temprano desde Tres Cruces. Llevá traje, hay tablas para compartir.',
   now() + interval '2 days', 6, 'intermedio',
   'Tres Cruces, Montevideo', -34.894000, -56.166000, 'Playa La Aguada, Rocha', -34.655000, -54.158000,
   'Rocha', 1200.00, 'programada', NULL, NULL, NULL),
  ('00000000-0000-4000-9100-000000000002', '00000000-0000-4000-8000-000000000001', (SELECT id FROM deporte WHERE nombre = 'Ciclismo'),
   'Pedaleada a Atlántida', NULL,
   now() + interval '5 days', 8, 'avanzado',
   'Parque Rodó, Montevideo', -34.913000, -56.168000, 'Atlántida, Canelones', -34.772000, -55.761000,
   'Canelones', NULL, 'programada', NULL, NULL, NULL),
  ('00000000-0000-4000-9100-000000000003', '00000000-0000-4000-8000-000000000003', (SELECT id FROM deporte WHERE nombre = 'Trekking'),
   'Trekking en el Pan de Azúcar', 'Subida tranquila, ideal para arrancar.',
   now() + interval '9 days', 10, 'principiante',
   'Tres Cruces, Montevideo', -34.894000, -56.166000, 'Cerro Pan de Azúcar, Maldonado', -34.800000, -55.237000,
   'Maldonado', 450.50, 'programada', NULL, NULL, NULL),
  ('00000000-0000-4000-9100-000000000004', '00000000-0000-4000-8000-000000000003', (SELECT id FROM deporte WHERE nombre = 'Surf'),
   'Surf en Punta del Diablo', NULL,
   now() - interval '2 days', 5, 'avanzado',
   'Tres Cruces, Montevideo', -34.894000, -56.166000, 'Playa de la Viuda, Rocha', -34.042000, -53.545000,
   'Rocha', 1500.00, 'iniciada', NULL, NULL, NULL),
  ('00000000-0000-4000-9100-000000000005', '00000000-0000-4000-8000-000000000003', (SELECT id FROM deporte WHERE nombre = 'Running'),
   'Running en la rambla', NULL,
   now() + interval '3 days', 12, 'principiante',
   'Pocitos, Montevideo', -34.911000, -56.150000, 'Punta Carretas, Montevideo', -34.923000, -56.159000,
   'Montevideo', NULL, 'cancelada', 'Se anuncia tormenta fuerte.', now() - interval '1 day', NULL),
  ('00000000-0000-4000-9100-000000000006', '00000000-0000-4000-8000-000000000001', (SELECT id FROM deporte WHERE nombre = 'Vóley playa'),
   'Vóley en Playa Ramírez', NULL,
   now() - interval '20 days', 8, 'intermedio',
   'Playa Ramírez, Montevideo', -34.916000, -56.170000, 'Playa Ramírez, Montevideo', -34.916000, -56.170000,
   'Montevideo', NULL, 'archivada', NULL, NULL, now() - interval '6 days'),
  ('00000000-0000-4000-9100-000000000007', '00000000-0000-4000-8000-000000000003', (SELECT id FROM deporte WHERE nombre = 'Ciclismo'),
   'Paseo en bici por el Prado', NULL,
   now() + interval '4 days', 2, 'principiante',
   'Prado, Montevideo', -34.858000, -56.205000, 'Parque Roosevelt, Canelones', -34.850000, -56.040000,
   'Canelones', NULL, 'programada', NULL, NULL, NULL);

-- Participaciones (el organizador siempre participa, CU10 paso 10)
INSERT INTO participacion (actividad_id, usuario_id, es_organizador, fecha_union) VALUES
  ('00000000-0000-4000-9100-000000000001', '00000000-0000-4000-8000-000000000003', TRUE,  now() - interval '3 days'),
  ('00000000-0000-4000-9100-000000000001', '00000000-0000-4000-8000-000000000004', FALSE, now() - interval '2 days'),
  ('00000000-0000-4000-9100-000000000002', '00000000-0000-4000-8000-000000000001', TRUE,  now() - interval '1 day'),
  ('00000000-0000-4000-9100-000000000002', '00000000-0000-4000-8000-000000000003', FALSE, now() - interval '12 hours'),
  ('00000000-0000-4000-9100-000000000003', '00000000-0000-4000-8000-000000000003', TRUE,  now() - interval '2 days'),
  ('00000000-0000-4000-9100-000000000003', '00000000-0000-4000-8000-000000000001', FALSE, now() - interval '1 day'),
  ('00000000-0000-4000-9100-000000000004', '00000000-0000-4000-8000-000000000003', TRUE,  now() - interval '9 days'),
  ('00000000-0000-4000-9100-000000000004', '00000000-0000-4000-8000-000000000001', FALSE, now() - interval '8 days'),
  ('00000000-0000-4000-9100-000000000005', '00000000-0000-4000-8000-000000000003', TRUE,  now() - interval '5 days'),
  ('00000000-0000-4000-9100-000000000006', '00000000-0000-4000-8000-000000000001', TRUE,  now() - interval '30 days'),
  ('00000000-0000-4000-9100-000000000006', '00000000-0000-4000-8000-000000000004', FALSE, now() - interval '29 days'),
  ('00000000-0000-4000-9100-000000000007', '00000000-0000-4000-8000-000000000003', TRUE,  now() - interval '1 day');

-- Invitados externos: también ocupan cupo
INSERT INTO invitado_externo (participacion_id, nombre)
SELECT p.id, invitado.nombre
FROM participacion p
JOIN (VALUES
  ('00000000-0000-4000-9100-000000000001'::uuid, '00000000-0000-4000-8000-000000000004'::uuid, 'Sofía'),
  ('00000000-0000-4000-9100-000000000007'::uuid, '00000000-0000-4000-8000-000000000003'::uuid, 'Lucas')
) AS invitado(actividad_id, usuario_id, nombre)
  ON p.actividad_id = invitado.actividad_id AND p.usuario_id = invitado.usuario_id;

-- Información ambiental (la genera n8n en el CU15; acá se carga a mano)
INSERT INTO informe_pronostico (actividad_id, zona, fecha, nivel_recomendado, resumen, datos_ambientales, interpretacion_disponible)
VALUES
  ('00000000-0000-4000-9100-000000000001', 'La Paloma', (now() + interval '2 days')::date, 'intermedio',
   'Olas ordenadas por la mañana; el viento aumenta después de las 11:00.',
   '{"olas_m": 1.2, "periodo_s": 9, "viento_kmh": 12, "viento_dir": "NE", "temperatura_c": 19}', TRUE),
  ('00000000-0000-4000-9100-000000000003', 'Pan de Azúcar', (now() + interval '9 days')::date, NULL,
   'Cielo parcialmente nublado, 22 °C, sin lluvia prevista.',
   '{"temperatura_c": 22, "lluvia_mm": 0}', FALSE);
