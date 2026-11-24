# CU26 Registro de pagos entre participantes

Implementación en API, web y mobile a partir de la ficha de CU26 y de CU24/CU25 para editar y eliminar pagos. La fuente inicial y la versión aportada el 22/11/2026 están extraídas en `docs/fuentes/`; el plan y las decisiones están en `docs/plan-cu26-registro-pagos.md`.

## Comportamiento

- Desde un balance propio pendiente, quien pagó o quien cobró puede registrar un pago total o parcial. Se sugiere el total adeudado y se informa el máximo permitido al rechazar un importe.
- Solo pagador y receptor consultan cada pago. Únicamente su autor puede editar su monto o eliminarlo; las personas y la actividad son inmutables.
- Se exige pertenencia actual y actividad Iniciada dentro de los 14 días desde su inicio, según el glosario. El archivado automático sigue pendiente de CU32; este módulo rechaza escrituras vencidas aunque esa tarea aún no corra.
- Los invitados no son partes de un pago: las deudas se imputan a su responsable registrado.
- El historial se conserva **seis meses calendario desde `fecha_archivado`**. Se oculta al vencer, sin esperar al proceso de limpieza. Las deudas archivadas permanecen visibles y en modo lectura.
- La limpieza retira filas individuales y respuestas de operaciones, conservando únicamente el efecto acumulado por pareja. Al recalcular no reaparecen deudas ya pagadas. No se infieren fechas para actividades archivadas que carezcan de `fecha_archivado`; CU32 debe registrar ese instante.
- Los avisos de gastos existentes no se extienden a pagos: CU26 no prescribe avisos adicionales.
- Gastos, pagos y balances se refrescan automáticamente entre sesiones mediante un Observer y Socket.IO, también al reconectar o volver a primer plano. El evento solo indica la actividad; los detalles de pagos se obtienen por HTTP con los permisos vigentes. Los borradores y las confirmaciones conservan su versión. El botón de actualización queda como respaldo. Implementación y pruebas del 23/11/2026: `docs/testing/actualizacion-financiera-2026-11-23.md`.

## Migración y ejecución

Preparar y revisar `db/migrations/007_cu26_pagos.sql`, después de 005 y 006. Agrega intenciones durables, índices de historial, acumulados de pagos archivados y protección RLS/permisos de las tablas financieras. No modifica scripts anteriores.

**Migraciones 005, 006 y 007 aplicadas a Supabase el 22/11/2026, por pedido del usuario, juntas en una transacción.** Se verificaron las nueve tablas con RLS habilitado y sin grants directos a PUBLIC, anon o authenticated. El recibo con hashes está en `docs/testing/cu26/migracion-supabase-2026-11-22.json`. La API de desarrollo se reinició y arrancó contra Supabase. La conexión backend debe tener acceso directo como propietaria o un rol backend adecuadamente autorizado; los clientes `anon`/`authenticated` no deben acceder por PostgREST. Verificar el rol real y los permisos en ese despliegue.

Al arrancar la API se procesa un lote de hasta 20 actividades vencidas y se repite cada hora. Cada lote usa una transacción, bloquea las actividades y evita competir con otra instancia mediante `SKIP LOCKED`. La función devuelve la limpieza del temporizador y se registra en los eventos de cierre. Las consultas controlan la retención aunque la limpieza esté demorada.

## Integridad y rendimiento

Las escrituras serializan por actividad y por clave de operación. Se vuelve a calcular la deuda dentro de la misma transacción que guarda el pago, los balances, el resultado durable y la auditoría SQL. Editar excluye el pago anterior al determinar el máximo. Versiones vigentes y confirmación explícita protegen las bajas concurrentes.

`BalancesRepositorio` comparte el cálculo entre gastos y pagos. PostgreSQL agrupa los movimientos por pareja y el dominio verifica la capacidad exacta en centésimos. Los listados usan cursor de fecha con microsegundos y UUID, con 20 elementos por página e índices por cada parte del pago. No se almacenan balances en Redis.

Se mantienen capas, entidades de dominio e inyección de dependencias. La auditoría reutiliza el observador durable existente y su temporizador central; las llamadas a MongoDB no forman parte de la transacción financiera. La auditoría de pagos no copia importes ni el historial. Los clientes conservan la misma intención durante un resultado incierto y verifican antes de reenviar. Web comparte los balances obtenidos por gastos; mobile actualiza gastos al recuperar el foco después de volver de pagos.

## Cómo debuggear el flujo principal

1. `PagosControlador.crear` en `api/src/modulos/pagos/pagos.controlador.ts`: sesión, UUID, datos y clave HTTP.
2. `PagosServicio.ejecutar` en `pagos.servicio.ts`: bloqueo, autorización, reintento, estado y partes involucradas.
3. `BalancesRepositorio.calcular` en `api/src/modulos/gastos/balances.repositorio.ts`: deuda vigente y exclusión al editar.
4. `Pago.validar` en `pago.entidad.ts`: importe entero positivo y máximo.
5. `PagosRepositorio.guardar`, `balances.recalcular` y `confirmar`: escrituras que deben confirmar o revertirse juntas.
6. `usePagos.ejecutar` y `completar` en cada cliente: resultado confirmado, actualización y recuperación de respuestas perdidas.

Los contratos están en Swagger bajo Pagos. Las pruebas reales de HTTP/SQL están en `api/test/pagos.integracion.test.ts`; las de importes de cliente, en `test/pagos.test.mjs` de cada cliente. El documento de evidencia distingue integración, revisión web y verificación mobile sin afirmar pruebas nativas no ejecutadas.
