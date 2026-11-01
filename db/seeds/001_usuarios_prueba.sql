-- FaltaUno - usuarios de prueba para el CU01 (Inicio de sesión)
-- SOLO para desarrollo local. Se puede ejecutar varias veces: reemplaza los datos de estos usuarios.
--
-- Contraseña de las cuentas locales: FaltaUno123!
--
--   armanelian@gmail.com cuenta verificada           -> FP: inicia sesión (también con Google, RN5)
--   bruno@faltauno.uy   cuenta pendiente de verificar -> E1 con contraseña; RN6 si entra con Google
--   carla@faltauno.uy   cuenta creada con Google     -> E3 con contraseña; A1 con Google
--   diego@faltauno.uy   cuenta bloqueada 15 minutos  -> E4

INSERT INTO usuario (id, nombre, email, password_hash, proveedor_auth, proveedor_id, verificado, intentos_fallidos, bloqueado_hasta)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Elian Arman', 'armanelian@gmail.com',
   '$2b$12$p1eNBYdiljhLSy//CAm6pea8k68xQsPGcLIj5O0Y1Xnga0pC5Wo2O', 'local', NULL, TRUE, 0, NULL),
  ('00000000-0000-4000-8000-000000000002', 'Bruno Silva', 'bruno@faltauno.uy',
   '$2b$12$p1eNBYdiljhLSy//CAm6pea8k68xQsPGcLIj5O0Y1Xnga0pC5Wo2O', 'local', NULL, FALSE, 0, NULL),
  ('00000000-0000-4000-8000-000000000003', 'Carla Méndez', 'carla@faltauno.uy',
   NULL, 'google', NULL, TRUE, 0, NULL),
  ('00000000-0000-4000-8000-000000000004', 'Diego Rodríguez', 'diego@faltauno.uy',
   '$2b$12$p1eNBYdiljhLSy//CAm6pea8k68xQsPGcLIj5O0Y1Xnga0pC5Wo2O', 'local', NULL, TRUE, 0, now() + interval '15 minutes')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  proveedor_auth = EXCLUDED.proveedor_auth,
  proveedor_id = EXCLUDED.proveedor_id,
  verificado = EXCLUDED.verificado,
  intentos_fallidos = EXCLUDED.intentos_fallidos,
  bloqueado_hasta = EXCLUDED.bloqueado_hasta;
