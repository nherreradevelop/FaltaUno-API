# Plan de implementación de CU10 Crear actividad

Este plan prepara el desarrollo de CU10 en API, web y mobile para revisión del equipo. Incluye el diseño propuesto, los archivos afectados, las pruebas y las decisiones que faltan resolver. Todavía no implementa la funcionalidad.

Preparado el 7 de noviembre de 2026. RF relacionado: **RF-09**. Prioridad: **Must Have**. Planificación del documento: sprint 2, del 5 al 18 de noviembre de 2026; estimación original de CU10: 13 puntos y 38 horas, con documentación y testing incluidos.

## Decisiones aplicadas tras la revisión

El usuario respondió las dudas en la tabla original y pidió implementar el caso de uso. Se conservan esas respuestas textuales más abajo. Esta sección registra el alcance vigente y reemplaza las propuestas previas que hayan quedado incompatibles:

- D1: máximo inicial de **20**, disponible mediante `ACTIVIDAD_MAX_PARTICIPANTES`. Se cuentan organizador e invitados; no pueden superar el cupo. «Disponible para incorporaciones» se interpreta como tener cupos libres al momento de que otro usuario quiera unirse; una creación completa no admite más participantes.
- D2: el importe manual es el **total del traslado**. Se guarda en centésimos exactos y se muestra una aproximación por participante actual, incluidos invitados; no registra gastos ni balances de CU23.
- D3: descripción obligatoria. «Lugares disponibles» aparece únicamente cuando se marca vehículo propio y expresa cuántas personas puede llevar al destino, incluyéndose a sí mismo (aclaración solicitada el 10/11/2026). «Requiere vehículo» se conserva como dato de la actividad, sin inventar una incompatibilidad con que el organizador tenga uno.
- D4: integración con **Google Maps/Places API (New)**, con sugerencias en ambos clientes y resolución/validación del país y departamento en la API.
- D5: **placeholder** de información climática. La consulta real, reutilización y actualización de CU15 quedan pendientes por decisión expresa; no se devuelve un pronóstico ficticio.
- D6: **no** a la tabla de idempotencia en PostgreSQL. La reserva se conserva en Redis y apunta a un UUID de actividad; transacción y bloqueo por ese UUID serializan reintentos, sin una migración nueva. La garantía depende de que Redis conserve la reserva dentro de la ventana configurada.
- D7 (10/11/2026): el usuario aclaró expresamente que el **origen es opcional**. Sin Google Maps se usa **solo como destino** la ubicación provisional `-34.91635775362398, -56.11543161770436`. El organizador debe editarla más adelante; el aviso aparece en el formulario y en la confirmación. Se persiste una marca de destino provisional. Se requiere la migración `004` (originalmente `003`) para este ajuste del origen/destino; D6 continúa sin tablas ni columnas de idempotencia. La pantalla de edición posterior no forma parte de este cambio.

- D8 (11/11/2026): el usuario precisó que al marcar **vehículo propio** se debe indicar un **origen**. El origen sigue siendo opcional sin vehículo propio. La validación y los mensajes se aplican en web, mobile y API; la excepción de destino provisional no sustituye el origen del conductor. La ubicación provisional se configura mediante las variables `ACTIVIDAD_DESTINO_PROVISIONAL_LAT`, `ACTIVIDAD_DESTINO_PROVISIONAL_LNG` y `ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO` de la API.

- D9 (11/11/2026): el usuario solicitó una alternativa de selección mediante pin y priorizó **primero la web**. Se conserva la búsqueda por lugares. La API acepta coordenadas del origen/destino, las comprueba por geocodificación inversa y no las sustituye por el centro de una dirección cercana. El pin puede colocarse con clic, arrastrarse o ajustarse con teclado. No se aplica otra migración; mobile conserva la búsqueda por lugares.

- D10 (11/11/2026): el usuario amplió el mapa a mobile. Se implementa con `react-native-maps`, selección manual o ubicación puntual mediante `expo-location`, confirmación explícita y el mismo contrato de pines validado en la API. La integración anterior exclusivamente por lugares continúa disponible. El usuario mostró Maps SDK for Android/iOS habilitados en Google Cloud.

La implementación, configuración y verificaciones están descritas en [CU10 implementado](cu10-implementacion.md). Las secciones siguientes conservan el análisis y las propuestas originales para trazabilidad; no significan que se haya aprobado la integración climática ni la tabla rechazada.

## Decisiones para revisar primero

Las siguientes preguntas afectan el comportamiento y no tienen una respuesta cerrada en las fuentes revisadas. Las propuestas de esta sección requieren revisión; no son requisitos nuevos ya aprobados.

| ID  | Decisión pendiente                                                                                                                                             | Evidencia y efecto                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | ¿Cuál es el máximo de participantes permitido? ¿Puede el organizador completar todos los lugares con sus invitados al crear?                                   | CU10 RN2 no fija el máximo numérico. RN5 habla de un lugar libre para incorporaciones adicionales. El SQL solo exige un mínimo de 2; SMALLINT es un límite técnico, no el máximo de negocio. ponele que 20 pero mas adelante lo vemos como variable de entorno                                                                                                                                                                                                         |
| D2  | ¿El costo manual es total o por persona? ¿En qué moneda se muestra?                                                                                            | CU10 RN10 lo deja opcional y manual; el mockup dice «por persona». La tabla solo tiene `costo_estimado`. Internamente se propone usar centésimos enteros, según la skill. el costo que ingresa es el total y ese costo se divide entre participantes                                                                                                                                                                                                                   |
| D3  | ¿La descripción es obligatoria? ¿Cómo se interpretan «lugares disponibles» y «requiere vehículo» cuando el organizador trae invitados o tiene vehículo propio? | El FP incluye esos datos, pero no define todas sus combinaciones. La descripción admite NULL en SQL. El mockup no muestra descripción, invitados ni requiere vehículo. No se aplicará un límite de invitados, regla de nombres repetidos o relación entre lugares del vehículo y cupos sin acordarla. la descrpcion es obligatoria lugares disponibles deberia aparecer solo se se marca tiene vehiculo propio porque habla de personas que el puede llevar al destino |
| D4  | ¿Cómo se selecciona y valida una ubicación en web/mobile?                                                                                                      | El CU exige origen, destino y ubicación válida en Uruguay. No hay integración de mapas en los clientes revisados. Hay que acordar mapa/buscador o ingreso manual validado, y cómo obtener departamento y coordenadas sin que el cliente pueda inventar una ubicación aceptada por el servidor. No elegir un proveedor ni agregar una librería silenciosamente.                                                                                                         | pensaba integrar con google maps |
| D5  | ¿Qué alcance ambiental se entrega con CU10 en este sprint?                                                                                                     | CU10 FP6 requiere consulta real y reutilización de informes de CU15 A2; CU15 está planificado para sprint 4. No hay flujos JSON exportados de n8n en este clon. Ver alternativas más abajo. para la informacion climatica relevante deja un placeholder                                                                                                                                                                                                                |
| D6  | ¿Se aprueba persistir la clave de idempotencia junto con el alta en PostgreSQL?                                                                                | Es una propuesta técnica para cumplir RNF-10 incluso si se pierde la respuesta o se reinicia Redis. Agrega una tabla/restricción mediante una migración nueva. La guía original ubicaba idempotencia en Redis; no se asumirá que un bloqueo temporal garantiza evitar duplicados tras un fallo. no                                                                                                                                                                     |

También falta concretar en D5 la definición de zona geográfica, vigencia diaria, horizonte del pronóstico, timeout y límites de consultas. Deben ser configuración/contrato acordados, no constantes inventadas. Se propone presentar las fechas locales en `America/Montevideo` y transmitir el inicio como instante ISO 8601 con zona explícita; confirmar este criterio al aprobar el contrato.

## Diseño propuesto en ocho puntos

1. Web y mobile muestran el mismo formulario de CU10, usando sus componentes y cliente HTTP existentes.
2. La API entrega las opciones necesarias del formulario: deportes activos, niveles y máximo de participantes acordado.
3. El formulario consulta el pronóstico antes de confirmar, según el alcance ambiental aprobado en D5.
4. Un POST autenticado llega a rutas, controlador, servicio y repositorio del módulo `actividades`.
5. La entidad `Actividad` concentra reglas de sus propios datos; el servicio valida sesión/cuenta, catálogo y reglas que requieren colaboradores.
6. Una transacción crea actividad Programada, participación del organizador e invitados externos; el usuario organizador proviene de la sesión.
7. La clave de idempotencia y la huella del pedido permiten recuperar el mismo resultado ante reintentos, con el mecanismo aprobado en D6.
8. Tras el commit, se devuelve una confirmación real; un fallo del pronóstico es una advertencia y no impide la creación.

## Alcance de esta implementación

CU10 comprende formulario, validaciones, cancelación confirmada, creación, organizador como participante, invitados externos, transporte y costo manual opcional. Debe preservar datos cuando se corrige o reintenta, tratar sesión expirada y evitar duplicados.

CU08 y CU09 son otros casos de uso del mismo sprint. Para probar CU10 de forma independiente, la propuesta es mostrar una confirmación con el identificador creado y permitir volver al inicio. Si ya se integró CU09 al implementar, se podrá navegar a su detalle. No desarrollar búsqueda, detalle completo ni incorporar participantes adicionales dentro de esta tarea sin ampliar el alcance acordado.

CU22 está excluido de la entrega inicial. CU10 A2 queda documentado como no aplicable mientras no esté disponible; se mantiene el costo manual. No mostrar un botón «Estimar viaje» que no funcione. CU35, CU36, chat, gastos, pagos y notificaciones no forman parte de este cambio.

## Base existente comprobada

| Pieza        | Situación encontrada                                                                                                         | Consecuencia para CU10                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| API          | Existen módulos `auth` y `usuarios`; `crearApp` monta sus routers.                                                           | Crear módulo de actividades y montarlo.                                                                         |
| Dominio y BD | El SQL inicial ya define `actividad`, `participacion`, `invitado_externo`, `deporte` e `informe_pronostico`.                 | Reutilizar esquema; no recrear tablas ni modificar migraciones aplicadas.                                       |
| PostgreSQL   | `infra/postgres.ts` expone pool y tipo `Ejecutor`, sin helper transaccional.                                                 | Agregar helper con BEGIN/COMMIT/ROLLBACK y liberación del cliente.                                              |
| Sesiones     | `crearRequiereSesion` verifica Redis y completa `req.usuarioId`; el servicio de usuarios también comprueba la cuenta activa. | Reutilizar el middleware y verificar cuenta activa al crear; no aceptar `organizadorId` enviado por el cliente. |
| Errores      | AppError, validación Zod y manejador centralizados.                                                                          | Mantener el formato `{ error: { codigo, mensaje, campos? } }`.                                                  |
| Web/mobile   | Clientes HTTP centralizados, timeout y cierre local ante 401 autenticado.                                                    | Ampliar las opciones del cliente para enviar la clave de idempotencia; conservar el manejo de sesión.           |
| CORS         | La API permite `Content-Type` y `Authorization`.                                                                             | Habilitar `Idempotency-Key` y verificar preflight desde web.                                                    |
| Pantallas    | Los inicios son provisorios y señalan CU08 como pendiente.                                                                   | Agregar acceso explícito a «Crear actividad», sin simular la búsqueda pendiente.                                |
| Pronóstico   | Hay estructura SQL y documentación de n8n, sin adaptador ambiental ni workflows exportados.                                  | D5 requiere un alcance explícito antes de implementar esta parte.                                               |
| CI           | API ejecuta build y `npm test`; Jest tiene umbral de cobertura al medirla.                                                   | Agregar ejecución explícita de cobertura: el comando actual del CI no la mide.                                  |

Las comprobaciones se hicieron sobre los archivos locales disponibles, sin sincronizar remotos. No se considera que la presencia de tablas equivalga a que un caso de uso ya esté implementado.

## Contrato propuesto entre clientes y API

Estos endpoints y nombres son una propuesta para revisar, no contratos ya existentes:

- `GET /api/actividades/opciones`: autenticado; devuelve deportes activos, niveles y máximo de participantes aprobado. Un catálogo pequeño y acotado del formulario no es una búsqueda general de actividades.
- `POST /api/actividades`: autenticado, con `Idempotency-Key`; recibe datos del formulario y devuelve **201**, identificador y estado de la actividad creada. El reintento de una operación ya confirmada recupera su resultado sin crear otra.
- `POST /api/actividades/pronostico`: solo si se aprueba el alcance ambiental real; consulta datos antes de que exista la actividad y distingue informe disponible de advertencia de indisponibilidad.

Datos del alta: nombre, deporte por ID, inicio ISO 8601, cupo máximo, dificultad, descripción según D3, origen/destino con dirección y coordenadas, departamento validado, datos de transporte, nombres de invitados externos y costo opcional. Se propone representar el costo del contrato en `costoEstimadoCentavos`; confirmar su significado y moneda en D2. No recibir estado, identidad del organizador ni rol como datos confiables del formulario.

La API debe rechazar datos inválidos, referencias de catálogo inexistentes/inactivas y fechas que ya no sean futuras al guardar. Los valores de dificultad son `principiante`, `intermedio` y `avanzado`. El estado inicial en SQL es `programada`.

La confirmación no debe depender de una llamada externa dentro de la transacción. Si se perdió una respuesta después del commit, el cliente conserva la intención y su clave para reintentar/consultar por el mismo mecanismo; no afirma que la actividad no existe ni genera una clave nueva para el mismo intento. Un cambio de datos tras un error de validación inicia una intención corregida y no reutiliza una clave ya confirmada con otro contenido. Un 401 mantiene el tratamiento de ER3 y no habilita recuperar resultados sin autenticación.

## Transacción, pronóstico y rendimiento

### Alta consistente e idempotente

Crear actividad, participación del organizador e invitados en una sola transacción. Si falla cualquier escritura, no debe quedar una actividad sin su organizador participante ni invitados parciales. Insertar invitados de forma agrupada y usar parámetros SQL.

Propuesta D6: registrar clave, usuario, huella y resultado de la operación en PostgreSQL dentro de esa misma transacción, con restricción única por usuario/clave y tratamiento de peticiones concurrentes. Si la transacción revierte, la operación queda disponible para un reintento; si confirmó pero se perdió la respuesta, se recupera la misma actividad. Misma clave con otro contenido produce conflicto. No guardar tokens, contraseñas ni un cuerpo completo innecesario.

La migración nueva para ese registro, y cualquier plazo de retención, se diseñan tras aprobar D6; no editar `001_esquema_inicial.sql`. Redis podrá apoyar controles temporales si hacen falta, sin ser el único respaldo de una creación confirmada. No se requieren cambios al esquema de gastos/pagos.

El alta inicial no tiene competencia con participantes externos antes de su commit: no agregar bloqueos de cupos propios de CU11 por anticipado. Sí resolver concurrencia de altas con la misma clave. La validación de cupos debe contar al organizador y sus invitados, según la decisión D1.

### Alternativas para D5

| Alternativa                         | Qué se implementa                                                                                                                                                               | Qué puede afirmarse al terminar                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Integración mínima real             | Adelantar de CU15 la consulta a demanda, validación/almacenamiento/reutilización y asociación al confirmar; coordinar workflow n8n y recuperación programada necesaria para E5. | CU10 puede cumplir FP6, RN8 y E5 si toda esa integración está disponible y se verifica. Requiere acordar el cambio de planificación. |
| Entrega parcial con clima pendiente | Implementar el alta y la UI de indisponibilidad, dejando explícita la dependencia de CU15. No fabricar informes ni prometer una actualización que todavía no existe.            | Se entrega un avance de CU10; FP6/RN8 y la recuperación de E5 siguen pendientes. No declarar CU10 completo.                          |

Si se elige integración real, los datos ambientales reutilizables deben distinguirse de la interpretación por deporte de CU15 RN4. El informe previo al alta debe sobrevivir a una falla de guardado y poder asociarse sin «consumirse», también cuando lo usen otras actividades. La FK única `informe_pronostico.actividad_id` requiere revisar el diseño de caché/asociación; el SQL inicial por sí solo no resuelve ese contrato.

Usar timeouts y configuración acordados; mostrar advertencia ante falla sin bloquear el alta. Si el usuario cambia destino, fecha, hora o deporte, descartar respuestas viejas de la UI y no asociar un pronóstico de los valores anteriores. Validar el informe en servidor; no confiar en un resumen enviado por el cliente.

### Patrones y efectos secundarios

Se mantienen capas, repositorios, entidades e inyección de dependencias, además de las fábricas de errores existentes. **Observer no es necesario para el alta inicial:** no hay varios interesados independientes dentro de este alcance, y la participación del organizador debe confirmarse transaccionalmente. No emitir eventos para resolver una escritura obligatoria ni introducir notificaciones/chat de otros CU.

Evitar consultas N+1 y llamadas repetidas a catálogo/pronóstico. No agregar índices sin justificar la consulta concreta: ya existen índices de actividad por estado/fecha y deporte. Si D5 requiere búsqueda de informes por zona/fecha/generación, diseñar el índice con esa consulta y en una migración nueva. No cachear cupos ni balances.

## Archivos previstos

Son rutas propuestas para la implementación posterior. Confirmar que sigan libres y acordes al repositorio al comenzar. El trabajo preparado ahora es únicamente este plan.

### FaltaUno-API

| Acción          | Archivos relativos a la raíz                                                                                                                           | Propósito                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Crear           | `api/src/modulos/actividades/actividad.entidad.ts`                                                                                                     | Datos y reglas propias de la actividad.                                                               |
| Crear           | `api/src/modulos/actividades/actividades.dto.ts`                                                                                                       | Esquemas Zod, opciones y respuestas.                                                                  |
| Crear           | `api/src/modulos/actividades/actividades.repositorio.ts`                                                                                               | Catálogo requerido, alta de actividad, participación e invitados usando Ejecutor.                     |
| Crear           | `api/src/modulos/actividades/actividades.servicio.ts`                                                                                                  | CU10 y transacción, con reloj/dependencias sustituibles para pruebas.                                 |
| Crear           | `api/src/modulos/actividades/actividades.controlador.ts`, `actividades.rutas.ts` en la misma carpeta                                                   | HTTP y endpoints autenticados.                                                                        |
| Modificar       | `api/src/infra/postgres.ts`                                                                                                                            | Helper transaccional probado.                                                                         |
| Modificar       | `api/src/app.ts`, `api/src/swagger.ts`                                                                                                                 | Router, CORS y contrato documentado.                                                                  |
| Según D1/D5     | `api/src/config/env.ts`, `api/.env.example`, `api/src/contexto.ts`, `api/src/index.ts`                                                                 | Configuración acordada e inyección de colaboradores necesarios.                                       |
| Según D6        | Repositorio de idempotencia dentro del módulo y nueva migración `db/migrations/003_*.sql`, si sigue siendo el siguiente número libre                   | Clave/huella/resultado y restricción única. El nombre definitivo depende del diseño aprobado.         |
| Según D5        | Adaptador `api/src/infra/pronostico.ts`, piezas del módulo ambiental, SQL nuevo y workflow JSON bajo `n8n/`                                            | Solo con alcance real aprobado; sin sustituir la integración por un doble en producción.              |
| Crear           | `api/test/actividad.entidad.test.ts`, `actividades.dto.test.ts`, `actividades.servicio.test.ts`, `actividades.integracion.test.ts`, `postgres.test.ts` | Reglas, orquestación, HTTP/persistencia e integridad; ajustar separación al contenido de las pruebas. |
| Modificar/crear | `api/test/dobles.ts`, `.github/workflows/ci.yml`, `README.md`, `docs/testing/cu10-casos-prueba.md`                                                     | Dobles, cobertura en CI, uso y evidencia trazable.                                                    |

### FaltaUno-Web

| Acción          | Archivos relativos a la raíz                                                    | Propósito                                                                              |
| --------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Crear           | `src/paginas/CrearActividadPage.tsx`, `src/api/actividades.ts`                  | Formulario y funciones HTTP del CU.                                                    |
| Modificar       | `src/api/cliente.ts`, `src/api/tipos.ts`                                        | Encabezados de idempotencia y tipos acordados.                                         |
| Modificar       | `src/rutas/Rutas.tsx`, `src/paginas/InicioPage.tsx`                             | Ruta privada y acceso a creación.                                                      |
| Modificar/crear | `src/estilos.css`, componentes de ubicación/formulario estrictamente necesarios | Reutilizar Campo/Boton, tipografías y paleta existentes; adaptar a escritorio y móvil. |
| Según D4        | Configuración/plantilla de entorno y dependencia de ubicación, si se aprueban   | Selección de origen/destino sin incorporar servicios por defecto.                      |

### FaltaUno-Mobile

| Acción    | Archivos relativos a la raíz                                                                           | Propósito                                                        |
| --------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Crear     | `app/(app)/actividades/crear.tsx`, `src/componentes/FormularioActividad.tsx`, `src/api/actividades.ts` | Pantalla Expo y formulario usando los componentes existentes.    |
| Modificar | `app/(app)/index.tsx`, y layout solo si la navegación lo requiere                                      | Acceso privado desde el inicio.                                  |
| Modificar | `src/api/cliente.ts`, `src/api/tipos.ts`                                                               | Mismo contrato e idempotencia que web.                           |
| Según D4  | Componentes/adaptación de ubicación y configuración necesaria                                          | Interacción nativa, teclado y selección de ubicaciones acordada. |

Las reglas, validaciones del servidor y datos del contrato son comunes. La navegación, selectores, confirmación de cancelación, teclado y presentación se adaptan a cada plataforma. No crear paquetes compartidos ni reorganizar los tres repositorios para resolver este CU.

## Pruebas y criterios de aceptación

Los casos siguientes están **planificados, no ejecutados**. Los datos numéricos de máximos, plazos y transporte se completan al resolver D1–D5. Cada ejecución deberá agregar resultado obtenido, estado, fecha, responsable y evidencia; conservar la trazabilidad a CU10/RF-09 y RN/RNF.

| Caso       | Flujo/regla            | Comprobación prevista                                                                                                                                            |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CP-CU10-01 | FP, RN3/RN4/RN9        | Con sesión/cuenta vigentes y datos válidos, confirmar una sola actividad Programada con organizador participante e invitados correctos; respuesta 201.           |
| CP-CU10-02 | FP6, RN8, CU15 A2      | Reutilizar informe actual compatible; en ausencia, consultar/validar/guardar y mostrar uno real antes de confirmar, según D5.                                    |
| CP-CU10-03 | A1                     | Cancelar y confirmar descarta el formulario sin alta; rechazar la cancelación mantiene los datos. Verificar web y mobile.                                        |
| CP-CU10-04 | A2, RN10               | Verificar costo manual opcional; documentar A2 como no aplicable por CU22 fuera del alcance. No presentar cálculo automático simulado.                           |
| CP-CU10-05 | E1, RN6                | Cada obligatorio ausente o formato inválido devuelve errores por campo y conserva el formulario, sin escrituras parciales.                                       |
| CP-CU10-06 | E2, RN1                | Rechazar inicio pasado o igual a «ahora» y el que deja de ser futuro durante la edición; comprobar fecha/hora y zona explícita con reloj controlado.             |
| CP-CU10-07 | E3, RN2/RN5            | Mínimo 2, máximo acordado y desbordes; organizador/invitados cuentan según D1. Probar límites exactos y superiores/inferiores.                                   |
| CP-CU10-08 | E4                     | Origen/destino inválidos, coordenadas incompletas o fuera del criterio geográfico acordado: rechazo sin alta.                                                    |
| CP-CU10-09 | E5                     | Timeout/falla ambiental muestra advertencia y permite crear; comprobar recuperación programada cuando exista, o marcar ese resultado pendiente según D5.         |
| CP-CU10-10 | ER1                    | Fallar al insertar actividad, participación o invitados revierte todas las escrituras del alta. El informe previo reutilizable se conserva.                      |
| CP-CU10-11 | ER2, RNF-09            | Error inesperado produce respuesta homogénea, log útil sin secretos y opción de reintentar.                                                                      |
| CP-CU10-12 | ER3, RNF-13/RNF-24     | Sin sesión, sesión vencida o cuenta inactiva: no crear, mostrar el tratamiento de sesión correcto; ignorar/rechazar identidad o estado impuestos por el cliente. |
| CP-CU10-13 | RNF-10                 | Doble envío concurrente con la misma clave crea una sola actividad; misma clave/otro contenido genera conflicto.                                                 |
| CP-CU10-14 | RNF-10                 | Pérdida de respuesta después del commit y reintento recuperan el resultado; fallo antes del commit permite reintentar sin registros huérfanos.                   |
| CP-CU10-15 | RNF-08/RNF-10          | Preflight permite Idempotency-Key desde web; fallo de red conserva formulario/intención y no confirma un resultado desconocido.                                  |
| CP-CU10-16 | RN7 y transporte/costo | Rechazar niveles fuera del catálogo y combinaciones de transporte inválidas acordadas; costo opcional y conversión exacta a NUMERIC, sin redondeos binarios.     |
| CP-CU10-17 | RN8 y presentación     | Cambiar los datos ambientales relevantes descarta respuestas viejas; un informe orientativo no cambia la dificultad ni bloquea la creación.                      |

Las unitarias verifican entidad/servicio con dobles. La integración debe probar PostgreSQL real de pruebas, rollback y concurrencia; los dobles no prueban restricciones SQL. Los escenarios HTTP pueden ejecutarse con el servidor de pruebas y herramientas ya disponibles, sin imponer una nueva librería. Usar Postman para evidencia de endpoints y pruebas cruzadas de formularios por otro integrante.

Verificaciones previstas al implementar:

| Directorio           | Comandos                                                    |
| -------------------- | ----------------------------------------------------------- |
| Raíz de FaltaUno-API | `npm run lint`, `npm run format:check`                      |
| FaltaUno-API/api     | `npm run build`, `npm run test:cobertura -- --runInBand`    |
| FaltaUno-Web         | `npm run lint`, `npm run format:check`, `npm run build`     |
| FaltaUno-Mobile      | `npm run lint`, `npm run format:check`, `npm run typecheck` |

Web/mobile no tienen script de tests en los package.json revisados; no confundir `npm test --if-present` en CI con pruebas efectivamente ejecutadas. La BD de integración será local/de pruebas, nunca la compartida. Umbral esperado en servicios: 70 % de líneas, sentencias, funciones y ramas, según Jest actual.

## Secuencia y revisión SCM

1. Revisar el plan y resolver D1–D6. Registrar la estrategia de clima y cualquier recorte aceptado.
2. Revalidar contratos y estado de los tres repositorios. API tiene la rama local `feature/cu10-crear-actividad`, creada desde `develop` para este plan. Al iniciar cambios en web/mobile, crear sus ramas desde sus respectivos `develop`, preservando el trabajo existente.
3. Implementar API/transacción/idempotencia y sus pruebas; sumar el alcance ambiental solo si se acordó. Preparar migraciones nuevas, sin aplicarlas a bases compartidas.
4. Implementar formularios de web/mobile con el mismo contrato; cubrir errores, cancelación y reintentos.
5. Ejecutar verificaciones, actualizar Swagger y registrar casos/evidencia; realizar prueba cruzada por otro integrante.
6. Preparar PRs a `develop` con CI verde y revisión de otro integrante. La implementación no equivale a autorizar push, merge o despliegue. No trabajar directamente en `main`.

No se creó todavía una rama en web/mobile porque esta preparación no modifica esos clones. La funcionalidad se considerará terminada cuando cumpla el alcance aprobado, las pruebas, la revisión/CI y la documentación. Si se elige clima parcial, documentar CU10 como avance con dependencia pendiente; no declarar todos sus flujos completos.

## Cómo depurar el flujo una vez implementado

Orden previsto de breakpoints: formulario web o mobile -> `src/api/actividades.ts` -> `src/api/cliente.ts` -> `crearRequiereSesion` -> controlador de actividades -> servicio -> helper transaccional -> repositorio -> retorno del servicio -> confirmación del formulario. Para pronóstico, seguir su consulta separada y el adaptador n8n fuera de la transacción. Los archivos nuevos listados son puntos previstos, no código ya disponible.

## Fuentes consultadas

- [Documento del proyecto: CU10, CU15, SQA y SCM](../FaltaUno_documentacion_CU37_y_detalle_sprint1.docx).
- [Skill aplicada](C:/Users/Usuario/.codex/skills/faltauno-desarrollo/SKILL.md) y sus referencias de arquitectura, datos, clientes y calidad.
- [Esquema SQL](../db/migrations/001_esquema_inicial.sql), [catálogos](../db/migrations/002_catalogos.sql), [pool PostgreSQL](../api/src/infra/postgres.ts), [montaje/CORS](../api/src/app.ts), [sesión](../api/src/comun/middlewares/requiereSesion.ts), [configuración](../api/src/config/env.ts), [Jest](../api/jest.config.js) y [CI de API](../.github/workflows/ci.yml).
- [Rutas web](../../FaltaUno-Web/src/rutas/Rutas.tsx), [cliente HTTP web](../../FaltaUno-Web/src/api/cliente.ts) y [estilos](../../FaltaUno-Web/src/estilos.css).
- [Inicio mobile](<../../FaltaUno-Mobile/app/(app)/index.tsx>), [cliente HTTP mobile](../../FaltaUno-Mobile/src/api/cliente.ts), [tema](../../FaltaUno-Mobile/src/comun/tema.ts) y [documentación de n8n](../n8n/README.md).
