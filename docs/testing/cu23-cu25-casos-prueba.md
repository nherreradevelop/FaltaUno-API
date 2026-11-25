# Evidencia CU23–CU25 — 22/11/2026

Responsable: Codex. Alcance aprobado: CRUD de gastos; pagos pendientes de CU26. No se usaron cuentas reales ni se ejecutaron escrituras de prueba contra Supabase.

## Entorno y ejecución

API con PostgreSQL `faltauno_test` local, esquema efímero por ejecución y Redis local `/15`. Cada prueba prepara una actividad iniciada, dos usuarios participantes y una invitada externa. Las migraciones 001, 004, 005 y 006 se aplican únicamente dentro del esquema de prueba. La suite elimina el esquema al terminar y cierra sus sesiones.

```powershell
cd api
$env:POSTGRES_URL_TEST='postgres://faltauno:faltauno_dev@127.0.0.1:5432/faltauno_test'
$env:REDIS_URL_TEST='redis://127.0.0.1:6379/15'
$env:MONGO_URL_TEST='mongodb://faltauno:faltauno_dev@127.0.0.1:27018/?authSource=admin'
npm run test:cobertura -- --runInBand
```

## Casos ejecutados

| ID     | CU/flujo               | Precondición, datos y pasos                                                                              | Resultado esperado y obtenido                                                                          | Estado               |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------- |
| CP-G01 | CU23 FP/RN7            | Participante registra $3 para otra persona. Consultar gasto, partes y balance.                           | Un gasto, versión 1 y deuda exacta; confirmados juntos.                                                | Aprobado             |
| CP-G02 | CU23 RN4/RN6           | Invitada paga $3,01 repartidos entre tres personas.                                                      | Identidad externa conservada, suma exacta y crédito imputado al responsable.                           | Aprobado             |
| CP-G03 | CU23 E1/E2/RN5         | Enviar concepto vacío, monto cero, selección vacía, duplicados y personas ajenas.                        | 400 sin gastos ni balances parciales.                                                                  | Aprobado             |
| CP-G04 | CU23 E3/RN2            | Actividad programada, archivada, cancelada o iniciada hace 14 días.                                      | Operación rechazada y balances intactos.                                                               | Aprobado             |
| CP-G05 | CU23 RN1 / CU24–25 RN1 | Solicitud sin sesión, de ajeno o de participante que no es autor.                                        | 401/403; no se modifica el gasto.                                                                      | Aprobado             |
| CP-G06 | CU23 ER1/RNF-10        | Dos solicitudes concurrentes con la misma clave. Consultar operación y reenviar.                         | Mismo ID, una sola escritura y un solo evento. Otros datos con esa clave se rechazan.                  | Aprobado             |
| CP-G07 | CU24 FP/RN6            | Cambiar monto, pagador y reparto, retirando una persona.                                                 | Versión incrementada y balance anterior retirado íntegramente.                                         | Aprobado             |
| CP-G08 | CU24 A2                | Confirmar mismos datos.                                                                                  | Misma versión, sin recálculo ni evento ficticio; operación auditable.                                  | Aprobado             |
| CP-G09 | CU24 E4                | Enviar dos ediciones concurrentes de versión 1.                                                          | Solo una se confirma; la otra recibe conflicto.                                                        | Aprobado             |
| CP-G10 | CU24 ER1               | Guardar edición, perder su respuesta, archivar y consultar/reintentar la misma intención.                | Recupera la edición confirmada sin escribir otra vez.                                                  | Aprobado             |
| CP-G11 | CU24 E1/E2/E4          | Editar sin reparto o después de eliminar el gasto.                                                       | 400/404; no se recrea ni sobrescribe.                                                                  | Aprobado             |
| CP-G12 | CU25 FP/RN6            | Eliminar y repetir la misma intención; intentar otra eliminación.                                        | Una baja lógica; mismo resultado de reintento; nueva baja rechazada.                                   | Aprobado             |
| CP-G13 | CU25 E2                | Cambiar el gasto antes de confirmar la eliminación con la versión anterior.                              | Rechazo por conflicto; requiere revisión y otra confirmación.                                          | Aprobado             |
| CP-G14 | CU23–25 ER2            | Forzar fallo SQL en recálculo tras alta, edición o eliminación.                                          | Rollback de gasto, partes, balances y operación; se registra el fallo.                                 | Aprobado             |
| CP-G15 | CU24–25 RN6            | Existe pago anterior; reducir gasto por debajo de lo ya pagado.                                          | El pago conserva su efecto y la deuda puede invertirse.                                                | Aprobado             |
| CP-G16 | Lectura                | 24 registros con misma fecha y microsegundos. Pedir dos páginas.                                         | 20 + 4, sin pérdidas ni duplicados.                                                                    | Aprobado             |
| CP-G17 | Auditoría RNF-26       | Entregar eventos, simular fallo de MongoDB y reintentar.                                                 | Acuse posterior a MongoDB, entrega por ID y evento pendiente ante fallo. Verificado con dobles.        | Aprobado             |
| CP-G18 | Observer               | Un observador falla, otro recibe el cambio; desuscribir y limpiar intervalos.                            | El fallo no cambia el resultado ni deja suscripciones activas.                                         | Aprobado             |
| CP-G19 | Web CU23 FP/E1/E2      | Enviar vacío, completar $100, tres personas e invitada pagadora.                                         | Errores por campo y preview $33,34 + $33,33 + $33,33.                                                  | Aprobado visualmente |
| CP-G20 | Web CU24 FP/A1         | Cambiar importe y cancelar; luego editar monto y pagador y guardar.                                      | Cancelar conserva original; guardar actualiza gasto y balances.                                        | Aprobado visualmente |
| CP-G21 | Web CU25 A1/FP         | Cancelar confirmación; volver a abrirla y eliminar.                                                      | Identifica concepto/monto/pagador; al confirmar desaparece de la lista y se retira su deuda.           | Aprobado visualmente |
| CP-G22 | Web ER1                | Entorno de prueba confirma el alta y sustituye su confirmación por HTTP 503. Pulsar Verificar resultado. | Conserva borrador, bloquea reenvío libre y recupera un único gasto confirmado con sus balances.        | Aprobado visualmente |
| CP-G23 | Web CU24 E4            | Abrir edición; cambiar el registro por otra operación; guardar y revisar versión actual.                 | Conflicto sin sobrescritura; borrador preservado hasta revisar; carga explícita de la versión vigente. | Aprobado visualmente |

La prueba visual se ejecutó con `api/test/gastos.visual.ts`, API temporal en 3001 y web temporal en 5174. Se usaron solo identidad, contraseña, actividad e importes ficticios. El fixture tiene un fallo de confirmación deliberado y **no forma parte del servidor de aplicación**.

![Detalle de gasto y reparto en la revisión web](cu23-cu25/gasto-web.jpg)

## Ampliación — avisos de gastos con CU40

Decisión del usuario: **en edición se avisa solo al pagador y reparto nuevos**. Altas y eliminaciones avisan a sus involucrados. Los responsables de invitados reciben los avisos correspondientes; un mismo usuario no se duplica por roles o partes.

| ID      | Verificación                                                                                                                                | Resultado                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| CP-NG01 | Alta y eliminación reservan un aviso por usuario involucrado en la misma transacción del gasto.                                             | Aprobado con PostgreSQL real.                  |
| CP-NG02 | Cambiar a un pagador/reparto nuevos no avisa a los anteriores ni agrega al autor por ser autor.                                             | Aprobado con PostgreSQL real.                  |
| CP-NG03 | Pagador externo y varias partes del mismo responsable no duplican destinatario; partes cero no generan cobro.                               | Aprobado.                                      |
| CP-NG04 | Confirmar sin cambios o reintentar una operación confirmada no reserva avisos adicionales.                                                  | Aprobado con PostgreSQL real.                  |
| CP-NG05 | Si falla la reserva SQL, el gasto y los balances se revierten; no se emite el evento de cambio.                                             | Aprobado con PostgreSQL real.                  |
| CP-NG06 | Entrega parcial: acusa solo destinatarios confirmados, conserva los fallidos y reutiliza su clave en el reintento.                          | Aprobado con dobles.                           |
| CP-NG07 | Pérdida del acuse SQL: la reentrega conserva la misma clave y no crea otro documento.                                                       | Aprobado con dobles y MongoDB real.            |
| CP-NG08 | Seis entregas concurrentes con la misma clave generan un documento, un ID y un no leído.                                                    | Aprobado con MongoDB real en una base efímera. |
| CP-NG09 | Reintentar después de marcar leída conserva lectura y fecha de creación.                                                                    | Aprobado con MongoDB real.                     |
| CP-NG10 | El flujo previo de Nico sin clave mantiene notificaciones independientes y el aislamiento entre usuarios.                                   | Aprobado con MongoDB real.                     |
| CP-NG11 | Los avisos se procesan en orden por usuario, sin bloquear a otros usuarios; auditoría y notificaciones son independientes y se desuscriben. | Aprobado.                                      |

Los tres tipos nuevos viajan por el contrato existente de CU40 y abren la actividad. La interfaz no cambió en esta ampliación. La integración de MongoDB se ejecuta contra una base efímera con prefijo `faltauno_test_notificaciones_` y la elimina al finalizar; CI incorpora un servicio MongoDB equivalente.

## Resultados y límites

- API con la ampliación de notificaciones: 287 pruebas aprobadas en 24 suites; cobertura de líneas de `gastos.servicio.ts`: 97,95 % y de `notificaciones.servicio.ts`: 100 %.
- Web: 83 pruebas aprobadas. Mobile: 77 pruebas aprobadas.
- El bundle Android se generó correctamente con la nueva pantalla. No había dispositivo conectado: no se verificó visualmente en Android nativo ni en iOS.
- La auditoría de MongoDB se verificó con dobles, incluyendo orden de entrega, fallo y reintento. La integración SQL/HTTP sí usa PostgreSQL y Redis reales; la deduplicación y compatibilidad de notificaciones se verifican además con MongoDB real.
- CI remoto, revisión humana y aplicación de la migración en Supabase permanecen pendientes.
- Lint, compilación, tipos y formato de los cambios verificados. El comando global `format:check` detecta además `docs/testing/registro-evidencia-2026-11-14.md`, un archivo local anterior a esta tarea que se conservó sin modificar.
- Revisión de Supabase en modo de solo lectura: existen las cuatro tablas financieras originales, no hay grupos duplicados de personas en el reparto y aún no están la columna de pagador externo ni las dos tablas de 005. No se ejecutó la migración allí.
