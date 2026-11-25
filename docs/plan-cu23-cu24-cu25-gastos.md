# Plan de implementación — CU23, CU24 y CU25

Estado: aprobado por el usuario el 22/11/2026; implementación local completada y verificada. Aplicación de la migración en Supabase, revisión humana y CI remoto pendientes.

## Ampliación solicitada — notificaciones de gastos

El usuario pidió conectar los cambios de gastos con CU40 para avisar al pagador y a quienes se les cobra. Al consultar si una edición debía avisar a anteriores y nuevos involucrados, respondió expresamente: **“Avisar solo al pagador y reparto nuevos”**. Esta duda y su resolución quedan registradas junto con D1–D4.

- Altas: pagador y usuarios con parte positiva del reparto confirmado.
- Ediciones: solo pagador y reparto nuevos. No se agrega al pagador o reparto anteriores por su condición anterior.
- Eliminaciones: pagador y usuarios involucrados en el gasto que se elimina.
- Invitados externos: recibe el responsable registrado; un usuario recibe un solo aviso de esa operación aunque tenga varias partes o roles. El autor recibe el aviso si también es destinatario por esos roles.
- Las consultas, confirmaciones sin cambios, operaciones rechazadas y reintentos de una operación confirmada no generan nuevos avisos.

Diseño de la ampliación: conservar destinatarios y mensaje en PostgreSQL junto con el gasto (migración nueva 006), despertar un observador después del commit y entregar por `NotificacionesServicio.notificar`. El módulo de Nico conserva almacenamiento, campana, contador y Socket.IO; las reentregas usan una clave interna única para no duplicar documentos en MongoDB. La suscripción y el reintento se conectan en `suscripciones.ts`, independientemente de auditoría.

Archivos: `gastos.notificaciones.ts`, `gastos-notificaciones.observador.ts`, servicio y repositorio de gastos, repositorio y tipos de notificaciones, `index.ts`, `suscripciones.ts`, migración `006_notificaciones_gastos.sql` y pruebas unitarias/SQL/MongoDB. CI agrega MongoDB local para comprobar la entrega. Los clientes ya aceptan los nuevos tipos como texto y usan el destino de actividad existente; no se necesita otra pantalla.

Los textos propuestos e implementados identifican alta, modificación o eliminación, e invitan a revisar reparto y balances, sin publicar concepto ni importe en el aviso. Las pruebas cubren selección del estado nuevo, invitados, deduplicación, rollback, fallo de entrega, reintento y compatibilidad con los avisos previos de CU40. Supabase permanece fuera de las pruebas de escritura y sin migrar.

## Registro de dudas y decisiones aprobadas

Se conservan las dudas originales D1–D4 como antecedentes para revisión del equipo. El usuario aprobó las cuatro propuestas y pidió expresamente dejar las dudas registradas. Estas decisiones aplican a CU23–CU25; no modifican otras fichas por extensión.

- **D1 — Reparto y redondeo:** partes iguales, orden estable por identificador y centésimos sobrantes asignados a las primeras personas. Mostrar el reparto exacto antes de confirmar.
- **D2 — Cambiar quién pagó:** permitido al editar, siguiendo FP4 y la postcondición de CU24. Queda registrada la omisión de ese campo en RN3 para corregir la ficha.
- **D3 — Invitado externo como pagador:** permitido, conservando su identidad; el crédito se atribuye al usuario que lo incorporó. Se adapta el esquema mediante una migración nueva.
- **D4 — Alcance de pagos:** esta entrega implementa el CRUD de gastos. La edición y eliminación de pagos quedan `Pendiente: CU26`; no se consideran cubiertas por esta entrega parcial de CU24 y CU25.

También se aprobó el plan técnico: consultas mínimas para operar desde la pestaña Gastos, balances bilaterales, transacciones, versión optimista, verificación durable de reintentos y auditoría. Las migraciones y pruebas de escritura se ejecutan primero en la base local de pruebas; no hay autorización para aplicarlas a Supabase.

Fuente funcional: fichas CU23, CU24 y CU25 proporcionadas por el usuario en esta conversación.
Rama en API, web y mobile: `codex/cu23-cu24-cu25-gastos`.

## Diseño propuesto

1. API con módulo `gastos`, separado en entidades, DTO, rutas, controlador, servicio y repositorio.
2. Web y mobile muestran lista, detalle, formulario y confirmación desde la pestaña Gastos de una actividad.
3. La API obtiene los participantes registrados y externos de la actividad y valida toda autorización nuevamente al guardar.
4. CU23 crea el gasto y su reparto; CU24 exige la versión vigente para editar; CU25 exige esa versión para eliminar.
5. Los importes se transportan y calculan en centésimos enteros; PostgreSQL conserva `NUMERIC(12,2)`.
6. Cada cambio de gasto, reparto y balances se confirma en una transacción con bloqueo por actividad.
7. Cada intención de escritura tiene una clave de operación verificable; los reintentos recuperan el resultado confirmado.
8. Los clientes conservan el formulario y consultan la operación tras una respuesta perdida, sin confirmar cambios por su cuenta.
9. La eliminación es lógica, usa `fecha_eliminacion` y conserva el registro para verificar reintentos y auditar.
10. La auditoría se entrega a MongoDB después del commit; un registro de salida transaccional permite reintentar la entrega.

## Estado actual comprobado

- `001_esquema_inicial.sql` ya contiene `gasto`, `parte_gasto`, `pago` y `balance`.
- Gastos y pagos ya tienen `version` y `fecha_eliminacion`.
- `gasto.pagado_por_id` referencia una participación; no identifica directamente un invitado externo.
- Las partes permiten identificar a un invitado externo y a la participación responsable.
- `balance` representa deuda entre dos participaciones de la misma actividad.
- No existen módulos funcionales de gastos, pagos ni auditoría.
- La pestaña Gastos de web y mobile indica que CU34 está pendiente.
- La idempotencia existente es específica de CU10 y guarda su reserva en Redis; no hay historial durable de operaciones de dinero.
- La API en ejecución apunta a Supabase. Las nuevas migraciones y pruebas se prepararán y comprobarán en PostgreSQL local.

## Dudas originales y propuestas aprobadas

| ID  | Duda de las fichas                                                                                                                                                     | Propuesta                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | CU23 y CU24 exigen que las partes sumen el monto, pero no definen si el reparto es igual o manual ni quién recibe el ajuste.                                           | Reparto en partes iguales. Ordenar las personas por identificador estable y asignar un centésimo adicional a las primeras hasta agotar el resto. Mostrar el reparto exacto antes de confirmar.                                            |
| D2  | CU24 FP4 y la postcondición incluyen cambiar la persona que pagó; RN3 no la enumera entre los campos editables.                                                        | Permitir cambiar quién pagó, además del concepto, monto y reparto.                                                                                                                                                                        |
| D3  | CU23 RN4 admite participantes externos; el esquema no permite guardar un invitado externo como pagador. La regla de imputación descrita habla de su parte del reparto. | Permitir elegir un invitado externo como pagador, conservar su identidad y atribuir el crédito a la participación del usuario que lo incorporó. Requiere una columna adicional y validación de pertenencia.                               |
| D4  | El pedido habla de CRUD de gastos, pero CU24 y CU25 incluyen pagos y remiten a CU26, cuya ficha no fue proporcionada.                                                  | Entregar gastos en esta implementación y dejar la edición/eliminación de pagos indicada como `Pendiente: CU26`. Si se requiere cubrir pagos ahora, incorporar ese alcance y revisar su ficha antes de implementar su validación de deuda. |

## Lectura y balances propuestos para revisión

- Incorporar las consultas mínimas de lista, detalle y balances necesarias para usar CU23–CU25 desde los clientes. No se considera implementado el resto de CU34 sin su ficha.
- Proponer páginas de 20 registros mediante cursor, ordenadas por fecha e identificador. Es una decisión técnica de presentación, no un límite de negocio sobre la cantidad de gastos.
- Mostrar las personas del reparto por separado, incluidos invitados, y acumular su efecto en la participación responsable.
- Mantener balances bilaterales entre participaciones: compensar deudas opuestas de la misma pareja, sin simplificar deudas entre tres o más personas.
- Recalcular a partir de los gastos y pagos vigentes para retirar el efecto anterior al editar o eliminar. Si pagos anteriores producen un crédito en sentido contrario, reflejarlo invirtiendo deudor y acreedor de esa pareja.
- No crear pagos de CU26 ni implementar el archivado de CU32. Verificar el estado Iniciada y el plazo de 14 días al escribir, sin depender de que otro proceso haya actualizado el estado.

## Archivos previstos

### API

- Crear `api/src/modulos/gastos/gasto.entidad.ts`, `gastos.dto.ts`, `gastos.repositorio.ts`, `gastos.servicio.ts`, `gastos.controlador.ts`, `gastos.rutas.ts` y `gastos.swagger.ts`.
- Crear `api/src/modulos/gastos/operaciones-gastos.repositorio.ts` para el resultado durable de cada intención y su consulta.
- Crear `api/src/modulos/auditoria/auditoria.repositorio.ts` y `auditoria.observador.ts` para la entrega de eventos a MongoDB.
- Crear `api/src/comun/observable.ts`, `api/src/modulos/gastos/gastos.eventos.ts` y `api/src/suscripciones.ts` siguiendo la implementación única indicada por la guía.
- Modificar `api/src/app.ts`, `contexto.ts`, `index.ts` y `swagger.ts` para montar el módulo y sus dependencias.
- Crear fixtures y pruebas de entidades, servicio, auditoría e integración HTTP/SQL en `api/test/`.
- Actualizar `README.md`, documentación funcional y evidencia de testing.

### Base de datos

- Crear `db/migrations/005_cu23_cu24_cu25_gastos.sql`, sin modificar migraciones anteriores.
- Proponer un registro durable de operaciones de gastos para recuperar confirmaciones de alta, edición y eliminación incluso si Redis pierde datos.
- Incorporar la salida de auditoría dentro de la transacción, con entrega posterior a MongoDB y deduplicación por ID de evento.
- Agregar restricciones de unicidad para evitar repetir una persona en el reparto e índices para lista y recálculo.
- Si se aprueba D3, incorporar la referencia al invitado que pagó sin cambiar la participación responsable del balance.
- Crear datos de prueba locales de actividades iniciadas, participantes, invitados y gastos.
- No ejecutar esta migración contra Supabase durante la implementación sin autorización específica para esa base compartida.

### Web — repositorio FaltaUno-Web

- Crear `src/api/gastos.ts` y DTOs en `src/api/tipos.ts`.
- Crear `src/componentes/GastosDeActividad.tsx` y `FormularioGasto.tsx` con detalle, reparto, errores y confirmación de eliminación.
- Crear utilidades y estado de operación en `src/comun/gastos.ts` y `src/hooks/useGastos.ts`.
- Modificar `src/paginas/DetalleActividadPage.tsx` y `mensajesActividad.ts` para habilitar el contenido de la pestaña Gastos.
- Reutilizar cliente HTTP, componentes, diálogos, formato de montos y tokens existentes; agregar estilos en `src/estilos.css`.
- Incorporar pruebas de formulario, conflictos y recuperación tras pérdida de confirmación.

### Mobile — repositorio FaltaUno-Mobile

- Crear `src/api/gastos.ts` y DTOs en `src/api/tipos.ts`.
- Crear `src/componentes/GastosDeActividad.tsx` y `FormularioGasto.tsx`, con listas virtualizadas, teclado de importes y confirmación accesible.
- Crear utilidades y estado de operación en `src/comun/gastos.ts` y `src/hooks/useGastos.ts`.
- Modificar `src/componentes/PantallaDetalleActividad.tsx` y `src/comun/mensajesActividad.ts` para integrar Gastos.
- Agregar rutas delgadas en `app/` solo si los formularios necesitan pantalla propia, manteniendo la lógica en `src/`.
- Incorporar las mismas pruebas de comportamiento funcional que en web y comprobar tipos y bundle Android.

## Contrato HTTP propuesto

Todas las rutas requieren sesión y pertenencia actual a la actividad. La consulta del resultado de una operación verifica además su usuario autor.

| Método | Ruta relativa a `/api/actividades/:actividadId` | Función                                                        |
| ------ | ----------------------------------------------- | -------------------------------------------------------------- |
| GET    | `/gastos`                                       | Lista paginada y permisos de las acciones.                     |
| GET    | `/gastos/opciones`                              | Personas seleccionables y datos necesarios del formulario.     |
| GET    | `/gastos/:gastoId`                              | Detalle, reparto y versión vigente.                            |
| POST   | `/gastos`                                       | CU23; requiere `Idempotency-Key`.                              |
| PUT    | `/gastos/:gastoId`                              | CU24; requiere versión e `Idempotency-Key`.                    |
| DELETE | `/gastos/:gastoId`                              | CU25; requiere versión e `Idempotency-Key`.                    |
| GET    | `/operaciones-gastos/:clave`                    | Confirmación de una operación antes de permitir reenviarla.    |
| GET    | `/balances`                                     | Balances vigentes necesarios para el resultado de los tres CU. |

La versión puede transportarse en DTO o encabezado; su representación se fijará antes de integrar ambos clientes.
Una operación desconocida no se mostrará como confirmada. El mecanismo de consulta debe serializarse con una solicitud todavía en curso para no habilitar un reenvío prematuro.

## Patrones, transacciones y rendimiento

- Capas e inyección por constructor, respetando las convenciones existentes.
- Observer para avisar a auditoría después del commit; el recálculo del balance es una llamada directa dentro de la transacción, nunca un observador.
- Registrar el evento pendiente de auditoría en la misma transacción para no perderlo entre el commit y el aviso al observador.
- Auditar usuario, operación, entidad, fecha y resultado, sin tokens ni datos sensibles. Las operaciones rechazadas o fallidas también requieren registrar su resultado fuera de una transacción revertida.
- Bloquear la actividad y verificar las versiones en SQL para serializar cambios financieros concurrentes; volver a validar participación y estado bajo ese bloqueo.
- Consultar personas y partes en bloque, sin consultas por fila; insertar repartos y actualizar balances en lotes.
- Índices de actividad/fecha/ID para paginación e índices por actividad y pareja para balances.
- No usar Redis como fuente de balances ni como única garantía para impedir duplicados financieros.
- No agregar librerías nuevas para cálculos monetarios: operar en enteros y convertir el decimal exacto al entrar/salir de PostgreSQL.

## Verificación prevista

- CU23: alta válida, cancelar, datos incompletos, monto inválido, selección vacía, duplicados, personas ajenas, estado no válido, plazo de 14 días, externos y redondeo.
- CU24: edición, cancelar, confirmar sin cambios, permisos, versión desactualizada, registro eliminado y rollback completo.
- CU25: confirmación y cancelación, permisos, nueva confirmación tras cambios concurrentes, eliminación repetida y rollback.
- Errores de red: perder la respuesta después del commit y comprobar la recuperación del resultado sin doble efecto, incluso después de vaciar el estado temporal de Redis.
- Concurrencia: escrituras de gastos de la misma actividad, ediciones simultáneas y carrera entre editar/eliminar, sin sobrescribir una versión no revisada.
- Auditoría: evento solo de cambios confirmados, resultado de rechazos/fallos, reentrega tras fallo de MongoDB y deduplicación.
- API: Jest, integración en esquema aislado de `faltauno_test`, cobertura de servicios de al menos 70 %, build, lint y formato.
- Clientes: pruebas funcionales, build web, tipos mobile, bundle Android, lint y formato; inspección visual de los flujos disponibles.
- No usar cuentas ni datos reales de Supabase para pruebas de escritura.

## Textos propuestos para las pantallas

Mantener las acciones de las fichas: “Registrar gasto”, “Editar”, “Guardar cambios”, “Eliminar gasto”, “Cancelar” y “Reintentar”.
Mensajes de resultado: “El gasto fue registrado correctamente”, “El gasto fue actualizado”, “El gasto fue eliminado” y “No hay cambios para guardar”.
Confirmación de eliminación: identificar concepto, monto y persona que pagó; advertir “Eliminar este gasto actualizará los balances de la actividad”.
Resultado incierto: “No pudimos confirmar la operación. Conservamos tus datos; verificá el resultado antes de volver a enviarla”.
Conflicto de versión: “Este gasto cambió desde que lo abriste. Revisá los valores actuales antes de continuar”.

## Aprobación para iniciar código

El usuario aprobó D1–D4 y el plan en esta conversación: “si pero dejame esas dudas registradas”. Se cumple la condición de revisión previa de la guía `faltauno-desarrollo`. Las dudas permanecen visibles arriba y en la tabla para su revisión posterior.
