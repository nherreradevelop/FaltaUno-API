# Plan CU26 — Registro de pagos entre participantes

Estado: ficha localizada y leída; permisos de registro e historial confirmados por el usuario. Retención confirmada; implementación y verificaciones locales completadas. Migraciones 005–007 aplicadas a Supabase y pruebas nativas Android completadas. CI remoto, revisión humana y prueba iOS pendientes.

## Fuente documental verificada

Documento integral identificado por el registro del repositorio como el más reciente: `FaltaUno_documento_con_evidencia_Postman_2026-11-15.docx`, del 15/11/2026. Ubicación original: `C:/Users/Usuario/.codex/visualizations/2026/11/14/01a1dc4d-48ef-7150-bc6a-9f06bfd37b7c/postman-2026-11-15/`.

Se extrajo la ficha completa desde el encabezado CU26 hasta el inicio de CU27, preservando el orden de párrafos y filas de tablas, sin modificar el Word. La [fuente extraída](fuentes/cu26-registro-pagos.txt) incluye el SHA256 del documento. También se revisaron CU34, CU24 y CU25 y la definición general de RNF-16; esta última no fija un plazo numérico de retención.

## Alcance que sale de la ficha

- FP1–FP4: abrir Registrar pago desde un balance pendiente y sugerir el monto adeudado completo.
- FP5 / RN3: admitir pago total o parcial.
- FP7 / RN1–RN2: validar pertenencia a la misma actividad, deuda pendiente y monto mayor que cero que no supere la deuda en el momento de la operación.
- FP8–FP10 / ER1 / RNF-23: confirmar pago y balance juntos, con rollback y reintentos sin duplicados.
- A1: cancelar el formulario vuelve a balances sin modificar datos.
- E1: explicar el error de monto e indicar el máximo permitido; conservar el formulario para corregir.
- E2: informar que ya no existe deuda pendiente y no registrar el pago.
- E3 / RN6: actividad Iniciada para escribir; Archivada deja deudas e historial en modo lectura.
- RN4: historial de pagos consultable, con el permiso que se acuerde abajo ante la diferencia de formulación con CU34.
- RN5: completar la edición y eliminación de pagos de CU24/CU25; las fichas ya aportadas definen autoría, versiones, confirmación y retiro/aplicación del efecto anterior.
- RN7: los pagos de deudas de invitados se registran entre su responsable y el otro participante, no a nombre del invitado.

El pedido implementa registro de pagos de deudas entre participantes. La ficha no prescribe una pasarela, cobro bancario ni transferencia desde la aplicación.

## Decisiones del usuario y pendiente de retención

Respuestas recibidas el 22/11/2026:

- **P1 — Confirmada:** cualquiera de las dos partes puede registrar el pago: quien pagó o quien cobró. Mantener separados pagador, receptor y autor; una persona ajena al balance no puede registrarlo.
- **P2 — Confirmada:** cada pago y su historial solo pueden consultarlos quien pagó y quien recibió ese pago. Ser participante de la actividad por sí solo no habilita esa consulta. Esta decisión resuelve la diferencia entre CU26 RN4 y CU34.
- **P3 — Confirmada:** seis meses calendario desde `actividad.fecha_archivado`, según respuesta del usuario del 22/11/2026. Se aplica al historial de pagos de CU26; no se amplía automáticamente a chats u otros historiales.

El vencimiento se verifica en el servidor al listar, consultar detalles y recuperar intenciones. Un proceso por lotes retira los registros individuales y las respuestas de operaciones vencidas, conservando únicamente su efecto acumulado por pareja para mantener los balances correctos. La auditoría no copia importes ni el historial de pagos. El proceso usa la misma transacción y bloqueo de actividad que las escrituras y se limpia al cerrar la API.

Se contrastó también CU26 con el documento aportado por el usuario el 22/11/2026: `D:/Descargas/20260826-ATI-319004-341831-247305 (7).docx`. Su ficha mantiene las reglas de CU26; la extracción adicional está en `fuentes/cu26-documento-usuario-2026-11-22.txt`. El glosario define que Iniciada dura 14 días desde el inicio o hasta el archivo manual: se rechazan escrituras al vencer ese período, aunque CU32 aún no actualice el estado. El archivado automático de CU32 permanece fuera de este alcance.

## Diseño en diez puntos

1. Módulo de pagos con entidad, DTO, rutas, controlador, servicio y repositorio, sin SQL en servicios.
2. Compartir el cálculo exacto de balances con gastos para mantener una única regla sobre gastos, partes y pagos vigentes.
3. Abrir el formulario desde la deuda elegida, precargar el total y validar el importe en centésimos enteros.
4. Bloquear la actividad y volver a comprobar participación, estado y deuda dentro de la transacción de escritura.
5. Crear pago, recalcular balances y guardar confirmación durable/auditoría como una única operación.
6. Reutilizar el comportamiento de verificación de resultados inciertos: misma clave y datos al reintentar.
7. Mostrar historial paginado con pagador, receptor, monto y fecha, accesible únicamente a las dos partes de cada pago (P2).
8. Para editar, solo el autor y solo el monto; calcular la deuda sin contar el pago que se edita, como exige CU24 RN9.
9. Para eliminar, confirmar el registro y su versión vigente; restituir su efecto una sola vez y preservar auditoría.
10. Integrar web y mobile en Gastos y balances, reutilizando estilo, cliente HTTP, sesión y listas virtualizadas.

## Archivos previstos

### API

- Crear `api/src/modulos/pagos/pago.entidad.ts`, `pagos.dto.ts`, `pagos.repositorio.ts`, `pagos.servicio.ts`, `pagos.controlador.ts`, `pagos.rutas.ts` y `pagos.swagger.ts`.
- Extraer a `api/src/modulos/gastos/balances.repositorio.ts` los métodos compartidos de balances y la consulta de deuda pendiente, permitiendo excluir un pago al editarlo. Mantener compatibilidad con la API y pruebas de gastos existentes.
- Integrar las rutas y Swagger en `api/src/app.ts` y `api/src/swagger.ts`.
- Usar la salida durable de auditoría existente para resultados de pagos, sin llamadas a MongoDB dentro de la transacción financiera.
- Crear pruebas de entidad/servicio e integración de pagos y ampliar la regresión de gastos y balances.
- Actualizar documentación y las marcas Pendiente CU26 que esta implementación efectivamente resuelva.

### Base de datos

- Preparar una migración nueva `007_cu26_pagos.sql`; no modificar migraciones anteriores.
- La tabla `pago` ya tiene pagador, receptor, autor, monto, versión y fecha de eliminación; conservar esas columnas.
- Agregar el registro durable de intenciones/resultados de pagos y los índices necesarios para historial y recálculo.
- Incorporar la protección pendiente de las tablas financieras internas mediante permisos/RLS para su uso desde la API. Verificarla en la base local y no aplicarla a Supabase sin autorización específica.
- Usar solo fixtures y esquemas aislados de prueba. No crear pagos de prueba sobre cuentas de Supabase.

### Web — FaltaUno-Web

- Crear `src/api/pagos.ts`, `src/comun/pagos.ts`, `src/hooks/usePagos.ts`, `src/componentes/FormularioPago.tsx` y `src/componentes/PagosDeActividad.tsx`.
- Integrar Registrar pago en los balances y el historial/detalle de pagos en la sección existente, sin duplicar llamadas de balances entre componentes.
- Precargar el total, conservar la edición ante error, mostrar deuda máxima vigente, confirmar eliminación y resolver versiones concurrentes.
- Incorporar pruebas y estilos que reutilicen los tokens y componentes existentes.

### Mobile — FaltaUno-Mobile

- Crear los equivalentes de API, utilidades, estado, formulario e historial en `src/`.
- Integrar la pantalla actual de Gastos y sus balances; las rutas Expo permanecen delgadas.
- Usar teclado de importe, formulario que no quede tapado y listas virtualizadas para historial.
- Repetir las pruebas funcionales compartidas, comprobar tipos y generar el bundle Android.

## Contrato HTTP propuesto

Todas las rutas bajo `/api/actividades/:actividadId` requieren sesión y pertenencia actual. Las escrituras revalidan dentro de la transacción y las consultas de intención se limitan a su autor.

| Método | Ruta                        | Función                                                                              |
| ------ | --------------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/pagos`                    | Historial paginado con permisos según P2.                                            |
| GET    | `/pagos/opciones`           | Deudas y contrapartes con las que el usuario puede registrar un pago según P1.       |
| GET    | `/pagos/:pagoId`            | Detalle vigente y permisos de edición/eliminación.                                   |
| POST   | `/pagos`                    | Registrar, con clave de idempotencia y pago total o parcial.                         |
| PUT    | `/pagos/:pagoId`            | Editar monto, con versión y clave de idempotencia.                                   |
| DELETE | `/pagos/:pagoId`            | Eliminar lógicamente, con versión, confirmación del cliente y clave de idempotencia. |
| GET    | `/operaciones-pagos/:clave` | Consultar una intención antes de permitir el reenvío.                                |

La asignación de pagador/receptor se fija a partir del balance elegido; no permite cambiar la actividad ni las personas de un pago existente.

## Patrones y rendimiento

- Mantener capas, clases de dominio, inyección por constructor y fábricas de errores existentes.
- Pago y recálculo son llamadas directas dentro de la misma transacción; Observer no debe calcular balances.
- Reutilizar la entrega de auditoría después del commit y su reintento durable. La ficha CU26 no agrega notificaciones; conservar los avisos de gastos existentes sin ampliarlos automáticamente a pagos.
- Intenciones durables y bloqueo por actividad protegen frente a solicitudes simultáneas, respuestas perdidas y pérdida del estado temporal de Redis.
- Validar montos con enteros y convertir NUMERIC mediante texto exacto. No incorporar bibliotecas nuevas.
- Leer participantes/deudas en bloque, paginar historial con fecha/UUID e índices y conservar microsegundos del cursor.
- Evitar recálculos duplicados por componente y no almacenar balances en Redis.

## Pruebas previstas y trazabilidad

- CU26 FP: total sugerido, pago total, parcial y actualización exacta del balance.
- A1: cancelar no modifica pago ni deuda.
- E1: cero, negativo, no numérico y superior al máximo; indicar el máximo vigente.
- E2: deuda inexistente, ya saldada o modificada por otra operación antes de confirmar.
- E3/RN6: actividad archivada/programada/cancelada y límite de registro derivado del período Iniciada existente.
- RN1/P1: sesión, pertenencia, dos personas distintas, permisos de registro y actividad correcta.
- RN4/P2: historial, paginación y privacidad del permiso acordado.
- RN7: responsable registrado de invitados como pagador de sus deudas.
- RNF-23: duplicados, concurrencia y respuesta perdida después del commit, incluso con sesión renovada.
- ER1: rollback si falla el insert o el recálculo, sin balances ni pagos parciales.
- CU24: autoría, edición solo de monto, máximo calculado excluyendo el pago actual, sin cambios y conflicto de versión.
- CU25: cancelación, confirmación, eliminación lógica, versión modificada y reintento sin doble efecto.
- Regresión: gastos y sus notificaciones mantienen destinatarios, idempotencia y balances.
- Compilación, tipos, lint, formato, cobertura de servicios de al menos 70 %, integración local y revisión visual donde esté disponible.

## Textos previstos desde la ficha

Acciones: Registrar pago, Cancelar, Guardar cambios y Eliminar pago. Resultados: El pago fue registrado correctamente; no existe una deuda pendiente para registrar; la actividad está archivada y ya no admite pagos; no fue posible registrar el pago.

Para los estados técnicos ya exigidos por RNF-23 y las fichas CU24/CU25, reutilizar los textos de resultado pendiente, verificación y conflicto del módulo de gastos adaptados a pago. Los mensajes de monto indican el máximo vigente que entrega el servidor.
