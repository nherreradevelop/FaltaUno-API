# CU23–CU25 — Gastos de actividades

Implementación del registro, edición y eliminación de **gastos**, disponible en API, web y mobile, en la rama `codex/cu23-cu24-cu25-gastos` de cada repositorio.

Las cuatro dudas originales y sus resoluciones aprobadas permanecen en [el plan](plan-cu23-cu24-cu25-gastos.md#registro-de-dudas-y-decisiones-aprobadas). Las decisiones aprobadas son reparto igual con ajuste estable de centésimos, pagador editable, invitado externo como pagador con crédito del responsable y pagos pendientes de CU26. Esta entrega no completa la parte de pagos de CU24/CU25 ni el resto de CU34.

## Funcionamiento

- Desde una actividad Iniciada, abrir Gastos y Registrar gasto. En mobile, la pestaña abre una pantalla propia con listas virtualizadas.
- Completar concepto, monto total, quién pagó y personas del reparto. Los invitados externos figuran por separado y se identifica al usuario que los incorporó.
- Revisar el reparto exacto. Las partes iguales se ordenan por identificador; los primeros reciben un centésimo adicional hasta agotar el resto.
- Solo quien registró un gasto y sigue participando puede editarlo o eliminarlo. El pagador puede ser otra persona de la actividad.
- Las escrituras verifican el estado Iniciada y el plazo de 14 días desde el inicio. Una actividad archivada permite lectura a participantes, pero no escritura.
- Al editar o eliminar se exige la versión que el usuario revisó. Un conflicto conserva la edición y obliga a cargar y revisar la versión vigente; una eliminación requiere una nueva confirmación.
- Si se pierde la confirmación, se conserva la intención y se deshabilitan cambios y reenvíos libres. Verificar resultado recupera la operación confirmada o permite reenviar exactamente la misma clave, versión y datos. Si aún se desconoce el resultado, la operación sigue pendiente.

## Activación de la base

Preparar y probar las migraciones no las aplica a la base compartida. `005_cu23_cu24_cu25_gastos.sql` y `006_notificaciones_gastos.sql` deben aplicarse una sola vez, en ese orden, después de las anteriores.

Para una **base local ya inicializada**, desde FaltaUno-API:

```powershell
docker cp db/migrations/005_cu23_cu24_cu25_gastos.sql faltauno-postgres:/tmp/005.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 --single-transaction -f /tmp/005.sql
docker cp db/migrations/006_notificaciones_gastos.sql faltauno-postgres:/tmp/006.sql
docker exec faltauno-postgres psql -U faltauno -d faltauno -v ON_ERROR_STOP=1 --single-transaction -f /tmp/006.sql
```

Un volumen local nuevo aplica todas las migraciones por el inicializador Docker. Un volumen existente conserva sus datos y requiere aplicar manualmente la migración pendiente.

La configuración actual de esta PC utiliza Supabase. **No se aplicaron 005 ni 006 a Supabase**. La activación allí requiere autorización específica y una revisión previa del esquema vigente y de las partes de gastos existentes; los nuevos índices únicos rechazan duplicados previos en vez de descartarlos silenciosamente.

La API puede arrancar antes de la migración y advierte una vez que está pendiente; el módulo financiero necesita la migración para funcionar. Las variables de conexión existentes se conservan.

## Consistencia y rendimiento

`GastosRepositorio` concentra el SQL de gastos, operaciones y balances; no se agrega una clase vacía para cada tabla. La capa de servicio orquesta los casos de uso y el controlador valida el contrato HTTP.

Cada escritura bloquea su intención con un advisory lock y la actividad con `FOR UPDATE`. Gasto, partes, balances, resultado de operación y evento pendiente de auditoría se confirman juntos. Un error revierte todo. La reserva durable no depende del contenido de Redis; una sesión nueva del mismo usuario puede consultar el resultado confirmado.

Los importes individuales se calculan en centésimos enteros y se acumulan con `BigInt`; las conversiones a `NUMERIC(12,2)` usan texto decimal exacto. El límite técnico es la capacidad de la columna, no un tope de negocio adicional.

Los balances se reconstruyen desde gastos y pagos vigentes y se compensan por pareja. No se simplifican deudas entre tres personas. La parte o el crédito de un invitado se acumula en su participación responsable. Un pago previo conserva su efecto si luego se reduce o elimina un gasto, incluso si invierte la deuda.

La lista usa cursor estable de fecha/UUID, conserva microsegundos de PostgreSQL y devuelve 20 elementos por página. Las partes se leen mediante subconsultas indexadas en la misma consulta, sin viajes a la base por cada fila; el guardado del reparto y de balances se hace en lotes. Se descarta almacenar balances en Redis porque dejaría de ser la fuente transaccional.

## Auditoría y Observer

El servicio persiste la salida de auditoría dentro de la transacción y emite el evento de cambio después del commit. Confirmar sin cambios se audita y no emite un cambio ficticio. `suscripciones.ts` conecta el Observer con el entregador a MongoDB y devuelve su limpieza.

`AuditoriaObservador` entrega hasta 100 eventos pendientes por lote, deduplicando por ID con `upsert`. Solo marca el acuse SQL cuando MongoDB confirma. Se reintenta al iniciar, ante eventos y cada 15 segundos; el intervalo es técnico y no define una regla del dominio. Si cae MongoDB, el evento confirmado permanece en PostgreSQL.

Los rechazos del controlador y los rechazos/fallos del servicio también registran usuario cuando se conoce, entidad, fecha y resultado. Si PostgreSQL tampoco permite persistir el registro de un fallo, se emite un log estructurado; no se puede garantizar persistencia durante la caída de todas las fuentes durables. No se registran tokens ni datos del formulario en auditoría.

## Notificaciones al pagador y al reparto — CU40

Las altas, ediciones y eliminaciones reservan notificaciones en `notificacion_gasto_pendiente`, en la misma transacción del gasto. Las consultas, rechazos, reintentos y confirmaciones sin cambios no reservan nuevos avisos. En edición se usan **solo el pagador y el reparto nuevos**, por decisión expresa del usuario; en eliminación, los involucrados del gasto que se elimina.

Se avisa al pagador y a usuarios con parte positiva, incluidos responsables de invitados. Los roles y partes del mismo usuario se agrupan en un único destinatario; el autor también recibe el aviso cuando tiene uno de esos roles.

`GastosNotificacionesObservador` se suscribe en `suscripciones.ts`, después del commit e independientemente de auditoría. Procesa hasta 100 entregas por lote, con destinatarios distintos en paralelo y orden secuencial para cada usuario. Un fallo deja su entrega pendiente para el siguiente intento; no revierte el gasto ni afecta las entregas que sí se confirmaron.

La entrega reutiliza `NotificacionesServicio.notificar`: guarda en MongoDB, actualiza el contador y emite por Socket.IO. Una clave interna única en MongoDB conserva el mismo documento en las reentregas, sin resetear lectura o fecha. El evento en vivo puede reenviarse con el mismo ID para recuperar una entrega perdida; los clientes ya evitan duplicados por ID. Los avisos sin clave conservan el comportamiento previo de Nico.

La notificación abre la actividad mediante el destino existente. Los textos distinguen alta, modificación y eliminación sin incluir concepto ni importe. No se requieren cambios de pantalla en los clientes. La creación de índices de MongoDB incorpora un índice único disperso para la clave interna, compatible con las notificaciones existentes.

Para debuggear la entrega: `GastosServicio.ejecutar` → `GastosRepositorio.encolarNotificaciones` → commit → `Observable.notificar` → `GastosNotificacionesObservador.entregar` → `NotificacionesServicio.notificar` → `NotificacionesRepositorio.crear` → Socket.IO → proveedor de notificaciones de web/mobile.

## Cómo debuggear

1. Cliente: `GastosDeActividad` → `FormularioGasto` → `useGastos.enviar` → `api/gastos.enviarGasto` → cliente HTTP central.
2. API: `gastos.rutas.ts` → `GastosControlador` → `GastosServicio.ejecutar`.
3. SQL: `bloquearOperacion` → autorización y bloqueo de actividad → lectura de operación previa/versión → `Gasto.repartir` → `guardar` o `eliminar` → `recalcular` → `confirmarOperacion` y `auditar` → commit.
4. Después del commit: `Observable.notificar` → suscripción central → `AuditoriaObservador.entregar`.
5. Ante respuesta perdida: `useGastos.verificar` → `consultarOperacionGasto` → `GastosServicio.consultarOperacion`. La confirmación guardada identifica la intención; los clientes vuelven a consultar la lista y los balances vigentes.

El resumen de pruebas y límites de verificación está en [la evidencia de testing](testing/cu23-cu25-casos-prueba.md).
