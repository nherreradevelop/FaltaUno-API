-- FaltaUno - actividades de prueba para el CU08 (Buscar actividades)
-- SOLO para desarrollo local. Requiere 001_usuarios_prueba.sql. Se puede ejecutar varias veces.
-- Las fechas son relativas a hoy, así que siempre quedan en el futuro.
--
--   12 actividades disponibles, en distintos deportes, departamentos, niveles, franjas y cupos -> 2 páginas
--   1 organizada por Elian                     -> "Sos el organizador"
--   1 completa (con un invitado externo)       -> NO aparece (RN3)
--   1 programada con fecha ya pasada           -> NO aparece (RN2)
--   1 cancelada                                -> NO aparece (RN2)

-- Actividades: (n, deporte, nombre, días desde hoy, hora local, departamento, nivel, cupo, destino lat, destino lng, organizador, estado)
WITH datos(n, deporte, nombre, dias, hora, departamento, nivel, cupo, lat, lng, organizador, estado) AS (
  VALUES
    (1,  'Surf',        'Surf al amanecer en La Paloma',       1,  '07:00', 'Rocha',      'intermedio',   6, -34.663, -54.164, 4, 'programada'),
    (2,  'Running',     'Running por la rambla de Pocitos',    1,  '07:30', 'Montevideo', 'principiante', 10, -34.911, -56.150, 4, 'programada'),
    (3,  'Ciclismo',    'Vuelta en bici a Atlántida',          1,  '15:00', 'Canelones',  'intermedio',   8, -34.772, -55.758, 1, 'programada'),
    (4,  'Trekking',    'Cerro Arequita',                      2,  '09:00', 'Lavalleja',  'avanzado',     5, -34.287, -55.262, 4, 'programada'),
    (5,  'Vóley playa', 'Vóley en playa Ramírez',              2,  '18:00', 'Montevideo', 'principiante', 8, -34.917, -56.171, 4, 'programada'),
    (6,  'Surf',        'Surf en Punta del Este',              3,  '08:00', 'Maldonado',  'avanzado',     4, -34.962, -54.937, 4, 'programada'),
    (7,  'Fútbol',      'Fútbol 5 nocturno',                   3,  '21:00', 'Montevideo', 'intermedio',  10, -34.880, -56.170, 4, 'programada'),
    (8,  'Trekking',    'Quebrada de los Cuervos',             5,  '08:30', 'Treinta y Tres', 'intermedio', 6, -32.938, -54.460, 4, 'programada'),
    (9,  'Ciclismo',    'Ruta del vino en Carmelo',            6,  '10:00', 'Colonia',    'principiante', 12, -34.000, -58.284, 4, 'programada'),
    (10, 'Running',     'Running nocturno en el Prado',        7,  '20:30', 'Montevideo', 'intermedio',   15, -34.857, -56.212, 4, 'programada'),
    (11, 'Básquetbol',  'Básquet 3x3 en el Parque Batlle',     8,  '17:00', 'Montevideo', 'avanzado',     6, -34.896, -56.155, 4, 'programada'),
    (12, 'Surf',        'Surf en Punta del Diablo',            10, '06:30', 'Rocha',      'avanzado',     5, -34.044, -53.543, 4, 'programada'),
    (13, 'Surf',        'Surf en La Pedrera (completa)',       2,  '07:00', 'Rocha',      'intermedio',   3, -34.596, -54.123, 4, 'programada'),
    (14, 'Running',     'Running que ya empezó',              -1,  '08:00', 'Montevideo', 'principiante', 10, -34.911, -56.150, 4, 'programada'),
    (15, 'Trekking',    'Trekking cancelado en Piriápolis',    4,  '09:00', 'Maldonado',  'principiante', 8, -34.866, -55.274, 4, 'cancelada')
)
INSERT INTO actividad (id, organizador_id, deporte_id, nombre, fecha_hora_inicio, cupo_maximo, nivel,
                       origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng,
                       departamento, estado, fecha_cancelacion)
SELECT ('00000000-0000-4000-a000-' || lpad(datos.n::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad(datos.organizador::text, 12, '0'))::uuid,
       deporte.id,
       datos.nombre,
       ((current_date + datos.dias) + datos.hora::time) AT TIME ZONE 'America/Montevideo',
       datos.cupo, datos.nivel,
       'Tres Cruces, Montevideo', -34.894, -56.166,
       datos.nombre, datos.lat, datos.lng,
       datos.departamento, datos.estado,
       CASE WHEN datos.estado = 'cancelada' THEN now() END
FROM datos
JOIN deporte ON deporte.nombre = datos.deporte
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  fecha_hora_inicio = EXCLUDED.fecha_hora_inicio,
  cupo_maximo = EXCLUDED.cupo_maximo,
  estado = EXCLUDED.estado,
  departamento = EXCLUDED.departamento,
  nivel = EXCLUDED.nivel;

-- El organizador de cada actividad también ocupa un lugar
INSERT INTO participacion (actividad_id, usuario_id, es_organizador)
SELECT id, organizador_id, TRUE FROM actividad WHERE id::text LIKE '00000000-0000-4000-a000-%'
ON CONFLICT DO NOTHING;

-- La actividad 13 (cupo 3) se completa: Diego (organizador) + Elian + 1 invitado externo de Elian
INSERT INTO participacion (actividad_id, usuario_id, es_organizador)
VALUES ('00000000-0000-4000-a000-000000000013'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, FALSE)
ON CONFLICT DO NOTHING;

INSERT INTO invitado_externo (participacion_id, nombre)
SELECT p.id, 'Sofía (invitada de Elian)'
FROM participacion p
WHERE p.actividad_id = '00000000-0000-4000-a000-000000000013'::uuid
  AND p.usuario_id = '00000000-0000-4000-8000-000000000001'::uuid
  AND NOT EXISTS (SELECT 1 FROM invitado_externo ie WHERE ie.participacion_id = p.id);
