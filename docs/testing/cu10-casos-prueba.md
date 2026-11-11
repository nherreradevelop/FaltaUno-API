# Casos y resultados de CU10

Fecha: 7 de noviembre de 2026. Ejecutor de las comprobaciones automatizadas: Codex. Esta evidencia no sustituye una prueba cruzada por otro integrante ni una UAT. Requerimiento funcional: RF-09. Alcance revisado en [el plan](../plan-cu10-crear-actividad.md).

## Entorno y reproducción

API: Jest, PostgreSQL local `faltauno_test` y Redis local en la base lógica `/15`. La suite de integración crea un esquema aleatorio por ejecución, aplica ahí el SQL inicial y la migración `003`, y lo elimina al terminar. No usa datos de las bases compartidas. Google Maps se simula exclusivamente dentro de los tests.

```powershell
$env:POSTGRES_URL_TEST = 'postgres://faltauno:faltauno_dev@127.0.0.1:5432/faltauno_test'
$env:REDIS_URL_TEST = 'redis://127.0.0.1:6379/15'
npm --prefix api run test:cobertura -- --runInBand
```

Si no se definen ambas variables, Jest omite la suite de integración; un resultado con esa suite omitida no demuestra rollback o concurrencia reales. Los comandos de arriba usan únicamente las credenciales locales de ejemplo del proyecto.

## Ejecuciones automatizadas

Precondiciones comunes: cuenta de prueba verificada con sesión en Redis, deporte Surf activo y fecha futura; Google devuelve coordenadas y departamento de Uruguay desde un doble del proveedor. Datos base: actividad «Salida de surf», cupo 5, un invitado Ana y costo total de 120050 centésimos.

| ID         | CU/flujo          | Entrada y pasos                                                                             | Resultado esperado                                                                       | Resultado obtenido / estado                                                                                                   |
| ---------- | ----------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CP-CU10-01 | FP, RN3/RN4/RN9   | Enviar alta válida autenticada con invitado y costo total.                                  | 201, Programada, organizador participante, invitado y costo exacto.                      | Confirmado en HTTP/SQL: `1200.50`, una participación organizadora e invitado. Aprobado.                                       |
| CP-CU10-02 | FP6/RN8           | Consulta y reutilización ambiental real.                                                    | Informe real disponible según CU15.                                                      | Pendiente por placeholder expresamente autorizado; no se inventó un resultado.                                                |
| CP-CU10-03 | A1                | Completar formulario web, cancelar, rechazar descarte y luego confirmarlo.                  | Conservar datos al rechazar; volver sin alta al confirmar.                               | Verificado con navegador: se conservó el nombre y no aumentó la cantidad de POST. Aprobado web; dispositivo nativo pendiente. |
| CP-CU10-04 | A2/RN10           | Ingresar costo total opcional de 1200,50 con dos participantes actuales.                    | Enviar 120050 centésimos y mostrar 600,25 aproximados por persona.                       | Verificado en UI, DTO y SQL. A2 automático no aplica: CU22 fuera del alcance.                                                 |
| CP-CU10-05 | E1/RN6            | Omitir descripción, nombre, deporte, nivel válido o datos estructurales.                    | 400 sin alta; errores por campo y formulario editable.                                   | Validado por esquema, servicio e integración. Aprobado.                                                                       |
| CP-CU10-06 | E2/RN1            | Usar fecha pasada o igual a ahora; convertir 07:30 de Uruguay a ISO.                        | Rechazar fecha no futura; enviar 10:30Z para la fecha elegida.                           | Verificado con reloj controlado y navegador. Aprobado.                                                                        |
| CP-CU10-07 | E3/RN2/RN5        | Cupo 1, cupo 21 o más personas que lugares; probar límite exacto.                           | Rechazo de desbordes; admitir ocupación hasta el cupo acordado.                          | Validado por entidad/esquema e integración. Aprobado.                                                                         |
| CP-CU10-08 | E4                | Resolver lugar argentino o respuesta sin departamento/coordenadas válidos.                  | No guardar; informar ubicación inválida o indisponibilidad del proveedor.                | Adaptador probado con respuestas controladas. Aprobado; proveedor real pendiente de clave.                                    |
| CP-CU10-09 | E5                | Abrir opciones/formulario.                                                                  | Mostrar placeholder sin informe ficticio ni bloquear por clima.                          | Placeholder visible en API/UI. Aprobado para el recorte; recuperación programada CU15 pendiente.                              |
| CP-CU10-10 | ER1               | Trigger de prueba falla al insertar invitado; reintentar luego con la misma clave.          | Rollback de actividad/organizador; después, un único alta correcto.                      | Comprobado en PostgreSQL real. Aprobado.                                                                                      |
| CP-CU10-11 | ER2/RNF-09        | Fallar persistencia, Redis, respuesta de Google o confirmación de COMMIT.                   | No informar éxito; error tipado o 500 genérico y liberación de conexión.                 | Unitarias e integración verificadas. Aprobado.                                                                                |
| CP-CU10-12 | ER3/RNF-13/RNF-24 | Token inválido, token que vence durante Google, cuenta no verificada o identidad inyectada. | 401 o validación, sin escrituras de alta.                                                | Servicio, esquema y HTTP verificados. Aprobado.                                                                               |
| CP-CU10-13 | RNF-10            | Enviar dos POST simultáneos con misma clave/cuerpo y luego otro con contenido distinto.     | Mismo UUID para los dos primeros; un alta; conflicto para el tercero.                    | Verificado con Redis/PostgreSQL reales: 201/201 y 409. Aprobado.                                                              |
| CP-CU10-14 | RNF-10            | Ignorar la primera confirmación y reenviar con misma clave.                                 | Recuperar la misma actividad sin repetir el alta.                                        | HTTP devuelve mismo resultado; SQL conserva un solo registro. Aprobado.                                                       |
| CP-CU10-15 | RNF-08/RNF-10     | Preflight CORS y fallo técnico de UI, seguido de reintento.                                 | Permitir Idempotency-Key; conservar cuerpo/clave, no permitir editar intención incierta. | CORS real y navegador con fixture 500->201 comprobados. Aprobado.                                                             |
| CP-CU10-16 | RN7/transporte    | Marcar/desmarcar vehículo; omitir lugares cuando sí tiene vehículo.                         | Mostrar lugares solo con vehículo; exigir número válido; null cuando no tiene.           | Esquema y navegador verificados. Aprobado.                                                                                    |
| CP-CU10-17 | Presentación      | Completar web en 1280px y 390px.                                                            | Sin desborde horizontal, estados y atribución visibles.                                  | Verificado con capturas y comprobación de ancho. Aprobado web responsive.                                                     |

Los archivos de pruebas están en `api/test/actividad.entidad.test.ts`, `actividades.servicio.test.ts`, `actividades.integracion.test.ts`, `google-maps.test.ts`, `idempotencia.repositorio.test.ts` y `postgres.test.ts`; `actividades.fixtures.ts` contiene los datos. Los demás tests previos se ejecutan junto con ellos para detectar regresiones.

## Calidad y verificaciones de clientes

Resultado final de la suite: **10 suites aprobadas, 76 pruebas aprobadas, ninguna omitida**. En servicios de actividades: 100 % de líneas, sentencias, funciones y ramas. En el total de servicios backend medidos: 100 % de líneas/sentencias/funciones y 95,45 % de ramas, por encima del umbral de 70 %.

La compilación de API/web, lint y verificación de tipos de mobile se ejecutan sobre el código final. Se generó el bundle Android de Expo (1198 módulos); no se firmó/publicó una app. La prueba web usa Edge headless contra Vite local y fixtures exclusivamente de pruebas: formulario, centésimos, horario, cancelación, reintento e interfaz responsive, sin errores de JavaScript.

La comprobación global de formato de API y web detectó exclusivamente cuatro JSON previos y no versionados bajo `.vs/` en cada clon; no se modificaron esos archivos del usuario. El formato de los archivos de CU10 se verifica por separado. Mobile pasa la comprobación global de formato. CI de la API ahora ejecuta cobertura explícita y dispone de Redis para la integración.

## Hallazgos y revisiones humanas pendientes

### Revisión del 10/11/2026: selectores nativos de mobile

CP-CU10-25 (FP/E2/presentación): se reemplazaron los textos manuales de fecha/hora por selectores nativos. Tras la observación del usuario sobre el diseño del reloj, Android usa dos ruedas para hora/minuto y mantiene el calendario para la fecha. Se observó en el emulador que la fecha elegida se conserva al cancelar la hora y se verificaron dos `android.widget.NumberPicker` dentro del diálogo con Aceptar/Cancelar. La captura está en `cu10-selectores-mobile/hora-ruedas-android.png` del directorio de visualizaciones. No se envió ninguna actividad durante esta comprobación de los selectores.

Resultado automatizado por Codex: 14/14 pruebas mobile aprobadas, incluidas cuatro nuevas para zona uruguaya, medianoche/cambio de año, reapertura de valores y mantenimiento del contrato ISO y de la fecha futura. Lint, tipos y formato de los archivos modificados aprobados. La dependencia se agregó en la versión seleccionada por Expo (9.2.1) y se incorporó el plugin manualmente porque la configuración es dinámica. No se actualizaron los otros paquetes de Expo ni se reconstruyó una app nativa. La prueba de iOS y una prueba funcional completa de alta con los nuevos selectores continúan pendientes; la observación de la interfaz Android no sustituye esas comprobaciones.

### Selección con pin en web (11/11/2026)

- El botón «Usar mi ubicación» tiene pruebas con posiciones simuladas: solicitud explícita única, precisión informada, permisos denegados, posición no disponible, timeout, navegador no compatible, cancelación y respuesta tardía, bloqueo del navegador y coordenadas inválidas. Total web tras este ajuste: 25 pruebas aprobadas. No se solicitó la ubicación real del usuario durante la verificación automatizada.

- Se verificaron con Google Maps real la apertura del mapa, el clic para colocar el pin, el arrastre, el ajuste con flechas y la confirmación por geocodificación inversa. No se crearon actividades de prueba en Supabase.
- Se corrigieron los avisos de `DEMO_MAP_ID` y eventos de marcadores avanzados usando `OverlayView`; una comprobación nueva de consola no registró esos avisos.
- Pruebas automatizadas locales de API: 117 aprobadas, con persistencia de coordenadas elegidas, rechazo de pines inválidos/fuera de Uruguay, validación de origen del conductor y recuperación del mismo alta por idempotencia. Las consultas a Google están simuladas en las pruebas automáticas.
- La integración HTTP usa PostgreSQL y Redis locales. La verificación visual usó Google real. La app móvil conserva el selector por lugares.

### Ampliación del mapa a mobile (11/11/2026)

- CP-CU10-MAP-M01 (FP/E4): pines para origen del conductor y destino, coordenadas exactas, combinación de lugar/pin, rechazo de pines incompletos o fuera de rango y conservación del contrato por lugar. Pruebas locales aprobadas.
- CP-CU10-MAP-M02 (ER2): errores `PUNTOS_*` previos a persistir permiten corregir; los fallos de resultado desconocido conservan el reintento idempotente. Pruebas locales aprobadas.
- CP-CU10-MAP-M03 (FP/E4/A1/ER2): fuente de GPS simulada, permiso explícito y una posición, permiso denegado, servicios apagados, error nativo, coordenadas/precisión inválidas, cancelación antes de iniciar, durante el permiso y durante el GPS, y timeout con respuesta tardía. Pruebas locales aprobadas; no se consultó el GPS real del usuario.
- Resultado automatizado de mobile tras el cambio: **29 pruebas aprobadas**, tipos, lint dirigido y formato de archivos modificados aprobados. Google y el GPS permanecen simulados en las pruebas automatizadas. La verificación de iOS queda pendiente de dispositivo/simulador.

### Ajuste del 11/11/2026: origen obligatorio con vehículo propio

- CP-CU10-ORIGEN-01: marcar vehículo propio sin origen. Web muestra el origen como obligatorio y el error «Si tenés vehículo propio, seleccioná tu punto de origen». Validado visualmente en el navegador; no se enviaron altas de prueba a Supabase.
- CP-CU10-ORIGEN-02: desmarcar vehículo propio. El error de origen desaparece y el campo vuelve a ser opcional. Validado visualmente en web y mediante pruebas de formulario de ambos clientes.
- CP-CU10-ORIGEN-03: enviar vehículo sin origen directamente a la API. Responde 400 con `campos.origenPlaceId`, sin consultar Google ni crear actividades. Pruebas de servicio y HTTP contra PostgreSQL/Redis locales aprobadas.
- CP-CU10-ORIGEN-04: guardar sin vehículo y sin origen, con destino provisional. La integración local conserva origen nulo, coordenadas configuradas, departamento y marca provisional; el reintento recupera la misma actividad.
- Ejecución automatizada local: 97 pruebas de API, 12 de web y 16 de mobile aprobadas; compilación de API/web y tipos de mobile aprobados. No sustituye la revisión humana ni una prueba funcional en dispositivo móvil.
- Migración `003` aplicada a la Supabase configurada con autorización expresa del usuario. Se verificaron las columnas, la restricción de origen completo y la conservación de la cantidad de actividades existentes. No se modificó el archivo SQL de la migración.

### Revisión del 10/11/2026: origen opcional y destino provisional

Esta revisión reemplaza la exigencia de origen de los casos previos y habilita la excepción de destino aprobada por el usuario después de CP-CU10-18/19. Se conserva el registro anterior como historial.

- CP-CU10-20 (FP/E4): crear sin origen; esperado/obtenido: contrato normalizado a null, sin consulta de Google para el origen, columnas de origen y punto de partida del organizador nulos. API y navegador aprobados localmente.
- CP-CU10-21 (E4): Maps no disponible y destino provisional; esperado/obtenido: coordenadas exactas `-34.91635775362398, -56.11543161770436`, `destino_provisional = true`, ninguna coordenada arbitraria aceptada del cliente y confirmación que solicita edición posterior. Integración PostgreSQL/Redis y navegador aprobados.
- CP-CU10-22 (E4/RNF-10): Maps disponible o recuperado; esperado/obtenido: no mostrar el destino provisional en el selector real, rechazar su identificador en una creación nueva con Maps disponible, recuperar un alta provisional previa con su misma clave aunque Maps haya vuelto. Aprobado en servicio, integración y navegador según el límite de cada prueba.
- CP-CU10-23 (ER2/E4): búsqueda con 503 y posterior recuperación; esperado/obtenido: activar destino provisional ante indisponibilidad, poder reintentar Google y quitar el provisional tras una búsqueda exitosa. Un error 400 de ubicación no activa la excepción. Aprobado en pruebas unitarias del adaptador y navegador con fixtures.
- CP-CU10-24 (presentación): etiqueta del vehículo incluye al organizador, origen borrable, aviso provisional en formulario/confirmación y ancho 390 px sin desborde. Aprobado en navegador; al usar el mismo lugar para origen y destino se detectó y corrigió una colisión de claves React.

Resultado de esta revisión, ejecutada por Codex: **10 suites API, 83 pruebas aprobadas, ninguna omitida**; cobertura del servicio de actividades: 100 % en líneas, sentencias, funciones y ramas. Cobertura global de servicios: 100 % en líneas/sentencias/funciones y 96,29 % en ramas. Clientes: **10/10 web y 10/10 mobile**, lint, build web y tipos mobile aprobados. Evidencia del navegador en `cu10-destino-provisional/resultado.json` y capturas del mismo directorio de visualizaciones de la sesión. Los contextos de navegador son aislados y usan fixtures; no crean actividades reales ni prueban Google externo. La integración escribe únicamente en su esquema temporal de `faltauno_test`. La migración `003` se aplicó además a `localhost/faltauno` para que el usuario pueda probar el cambio, conservando sus registros. Edición posterior, prueba en celular, revisión humana y CI remoto siguen pendientes.

### Regresión del 10/11/2026: validación sin Maps

Defecto CU10 de severidad media: al abrir el formulario sin `GOOGLE_MAPS_API_KEY`, «Crear actividad» quedaba deshabilitado. Además, la validación detenía su ejecución al faltar ubicaciones y ocultaba problemas en los demás campos. Reproducción: cargar opciones con `mapasDisponibles: false`, ingresar fecha pasada, cupo cero y costo negativo e intentar validar.

Corrección local verificada por Codex: se habilitó la validación y se reúnen los errores, manteniendo el requisito de origen/destino válidos para enviar el alta. Se agregaron ocho pruebas con `node:test` en cada cliente (`test/formularioActividad.test.mjs`), ejecutables con `npm test` y desde el paso de pruebas ya existente en CI. Resultado: 8/8 web y 8/8 mobile, sin omitidas; lint de ambos, compilación web, tipos mobile y formato de los archivos modificados aprobados. No se modificó la API para esta corrección.

CP-CU10-18 (E1–E4): Edge headless con fixtures de opciones sin Maps; esperado y obtenido: botón habilitado, errores simultáneos, foco en resumen, datos conservados y cero POST al faltar ubicaciones, aun corrigiendo el resto. Aprobado localmente. Evidencia: `cu10-validacion-sin-mapas/resultado.json` y `errores-sin-mapas.png` bajo el directorio de visualizaciones de esta sesión.

La regresión del flujo con fixtures de Google también pasó: alta, responsive a 390 px, costo/horario, reintento con el mismo cuerpo/clave y cancelación. Sin errores JavaScript. Estas pruebas usan contextos de navegador aislados, sin cambiar la sesión del usuario ni guardar actividades reales. No equivalen a una prueba contra Google ni a una prueba funcional en un celular; esas instancias continúan pendientes.

CP-CU10-19 (E1–E4, 10/11/2026, ejecución automatizada por Codex): extracción de `useFormularioActividad` en web y mobile. Edge headless verificó que no aparezcan errores de campos sin visitar al abrir, que un campo vacío muestre el error al perder foco, que corregirlo actualice su mensaje sin eliminar otros errores y que fecha/hora, vehículo e invitados dinámicos se revaliden. Con reloj del contexto de prueba, una fecha inicialmente futura pasó a ser anterior al momento de enviar: el hook volvió a validarla y evitó el POST. Resultado esperado y obtenido coincidentes; aprobado localmente, sin errores JavaScript. Evidencia en `cu10-useformulario/resultado.json` del directorio de visualizaciones de la sesión. Las ocho pruebas de funciones puras de cada cliente, lint, compilación web, tipos mobile y formato de los archivos modificados volvieron a pasar. Se repitió además la regresión de alta/reintento/cancelación con fixtures; no se ejecutó el hook en un dispositivo móvil ni se realizó una revisión humana.

- Falta configurar la clave de Google en el entorno local para ejecutar una prueba externa real. No se copiaron credenciales ni se hicieron llamadas facturables.
- Durante las pruebas se observó un defecto previo en el SQL: `usuario.estado` es VARCHAR(10), pero su CHECK admite `cierre_pendiente`, que tiene más caracteres. Corresponde revisar ese esquema al abordar CU33; esta entrega no altera una migración ya aplicada para resolverlo.
- Pendientes: sesión de prueba cruzada con otro integrante, ejecución en celular, CI remoto/PR y UAT del entregable. No hay resultados, responsables ni aprobaciones inventados para esas instancias.
