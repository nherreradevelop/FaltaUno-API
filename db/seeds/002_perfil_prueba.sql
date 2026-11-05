-- FaltaUno - datos de prueba para el CU04 (Visualizar perfil)
-- SOLO para desarrollo local. Requiere haber corrido antes 001_usuarios_prueba.sql.
-- Se puede ejecutar varias veces: reemplaza los datos de estos registros.
--
--   armanelian@gmail.com  biografía, 2 deportes, valoración promedio 4,33 (3 valoraciones),
--                         12 actividades en el historial (archivadas y canceladas) -> 2 páginas,
--                         y 1 actividad programada que NO aparece en el historial
--   bruno@faltauno.uy     sin valoraciones, sin deportes, sin historial
--   carla@faltauno.uy     biografía y 1 deporte (para ver un perfil ajeno, CU04 A1)

UPDATE usuario SET biografia = 'Surfeo todos los fines de semana en La Paloma. Busco gente para compartir el viaje.'
WHERE id = '00000000-0000-4000-8000-000000000001';
UPDATE usuario SET biografia = 'Salgo a pedalear los domingos de mañana.'
WHERE id = '00000000-0000-4000-8000-000000000003';

INSERT INTO usuario_deporte (usuario_id, deporte_id)
SELECT '00000000-0000-4000-8000-000000000001'::uuid, id FROM deporte WHERE nombre IN ('Surf', 'Running')
UNION ALL
SELECT '00000000-0000-4000-8000-000000000003'::uuid, id FROM deporte WHERE nombre = 'Ciclismo'
ON CONFLICT DO NOTHING;

-- 12 actividades terminadas (6 archivadas y 6 canceladas) y 1 programada, organizadas por Diego
INSERT INTO actividad (id, organizador_id, deporte_id, nombre, fecha_hora_inicio, cupo_maximo, nivel,
                       origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng,
                       departamento, estado, fecha_cancelacion, fecha_archivado)
SELECT ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-4000-8000-000000000004'::uuid,
       (SELECT id FROM deporte WHERE nombre = 'Surf'),
       'Salida de surf #' || n,
       now() - (n || ' weeks')::interval,
       6, 'intermedio',
       'Tres Cruces, Montevideo', -34.894000, -56.166000,
       'La Paloma, Rocha', -34.663000, -54.164000,
       'Rocha',
       CASE WHEN n % 2 = 0 THEN 'cancelada' ELSE 'archivada' END,
       CASE WHEN n % 2 = 0 THEN now() - (n || ' weeks')::interval END,
       CASE WHEN n % 2 = 1 THEN now() - (n || ' weeks')::interval + interval '1 day' END
FROM generate_series(1, 12) AS n
UNION ALL
SELECT '00000000-0000-4000-9000-000000000099'::uuid, '00000000-0000-4000-8000-000000000004'::uuid,
       (SELECT id FROM deporte WHERE nombre = 'Running'), 'Running en la rambla (programada)',
       now() + interval '7 days', 10, 'principiante',
       'Pocitos, Montevideo', -34.911000, -56.150000, 'Punta Carretas, Montevideo', -34.923000, -56.159000,
       'Montevideo', 'programada', NULL::timestamptz, NULL::timestamptz
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  fecha_hora_inicio = EXCLUDED.fecha_hora_inicio,
  estado = EXCLUDED.estado,
  fecha_cancelacion = EXCLUDED.fecha_cancelacion,
  fecha_archivado = EXCLUDED.fecha_archivado;

-- Diego organiza; Elian participa en las 13
INSERT INTO participacion (actividad_id, usuario_id, es_organizador)
SELECT id, '00000000-0000-4000-8000-000000000004'::uuid, TRUE FROM actividad WHERE id::text LIKE '00000000-0000-4000-9000-%'
UNION ALL
SELECT id, '00000000-0000-4000-8000-000000000001'::uuid, FALSE FROM actividad WHERE id::text LIKE '00000000-0000-4000-9000-%'
ON CONFLICT DO NOTHING;

-- Valoraciones recibidas por Elian: 5, 4 y 4 -> promedio 4,33
INSERT INTO valoracion (actividad_id, evaluador_id, evaluado_id, puntaje)
VALUES
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 5),
  ('00000000-0000-4000-9000-000000000003', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 4),
  ('00000000-0000-4000-9000-000000000005', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 4)
ON CONFLICT (actividad_id, evaluador_id, evaluado_id) WHERE evaluador_id IS NOT NULL DO UPDATE SET puntaje = EXCLUDED.puntaje;
