# CU10 Crear actividad

Se implementó el alcance aprobado de CU10 en API, web y mobile, con los ajustes que el usuario escribió en el plan. El pronóstico es un placeholder acordado; la integración real de CU15 y el cálculo automático de CU22 no están implementados en esta entrega.

## Comportamiento

El usuario autenticado completa nombre, deporte activo, inicio futuro, dificultad, descripción obligatoria, cupo, destino, transporte, invitados y costo total opcional. Según la aclaración del usuario del 11/11/2026, el origen es obligatorio si marca «Tengo vehículo propio» y opcional en los demás casos. Web y mobile lo indican y validan en el formulario; la API repite la validación antes de consultar Google y persistir. El destino normalmente se selecciona de Google Maps; la excepción por indisponibilidad se detalla abajo. El máximo inicial es 20 participantes y se puede configurar. El organizador y cada invitado cuentan para ese máximo.

«Tengo vehículo propio» habilita «Personas que puedo llevar al destino (incluyéndome a mí mismo)». Al desmarcarlo, se envía `lugaresVehiculo: null`. El campo `requiereVehiculo` se presenta en web y mobile con la etiqueta «Buscando traslado», según la corrección del usuario; conserva el mismo booleano y significado en la API. El importe ingresado es total; la interfaz calcula una estimación por participante actual. El total se almacena en NUMERIC con conversión exacta desde centésimos, sin generar gastos ni balances. Las fechas de los formularios corresponden a Uruguay y se envían como instantes ISO 8601.

La API valida sesión y cuenta, resuelve las ubicaciones reales con Google y comprueba que sean de Uruguay. El origen omitido se guarda como null tanto en actividad como en la participación del organizador. La identidad del organizador y el estado no se aceptan del cliente. Actividad Programada, participación del organizador e invitados se guardan en una sola transacción; si una escritura falla, se revierte el alta completa. La cuenta se vuelve a comprobar al persistir, con bloqueo de lectura para evitar cambios concurrentes durante esa transacción.

Cancelar pide confirmación. Los errores de validación conservan el formulario. Ante una respuesta de resultado desconocido, se conserva el cuerpo y la clave del intento y se ofrece recuperar la confirmación; no se afirma que el alta falló ni se habilita editar el pedido pendiente. No se consulta Google ni se crea otra actividad cuando se recupera una creación ya confirmada.

Corrección del 10/11/2026: «Crear actividad» permite comprobar los campos aunque Maps no esté configurado. Ambos clientes reúnen los errores locales de campos obligatorios, fecha, cupo, transporte, invitados, costo y destino, sin detenerse en el primero. Web enfoca el resumen y mobile desplaza el formulario hacia los errores; se conservan los datos ingresados. El máximo se toma de las opciones de la API. Con Maps disponible se exige seleccionar el destino real; con Maps no disponible se usa la excepción provisional aprobada por el usuario.

En ambos clientes, `src/hooks/useFormularioActividad.ts` concentra los valores, los campos visitados y los errores locales/del servidor. Expone `cambiar`, `visitar`, `validar` y `registrarErrores`. Los campos de texto muestran sus errores al perder el foco y los actualizan al corregirlos, conservando los errores de otros campos. Las reglas permanecen en las funciones puras de `src/comun/formularioActividad.ts`; `validar` vuelve a comprobar todo contra la hora actual al enviar. Las pantallas conservan el envío HTTP, la confirmación y la intención de reintento; el hook no genera nuevas claves ni realiza solicitudes.

Mobile reemplaza los campos manuales de fecha/hora por `SelectorFechaHoraActividad`: calendario nativo para fecha y ruedas de hora/minutos en Android, en formato de 24 horas. En iOS presenta el selector nativo de ruedas con Aceptar/Cancelar. El selector usa `America/Montevideo`, permite fechas desde el día uruguayo actual y conserva la validación de instante futuro en el hook y en la API. Confirmar modifica únicamente el campo elegido; cancelar conserva su valor. `@react-native-community/datetimepicker` 9.2.1 se instaló con Expo en la versión compatible con SDK 58, con su plugin en `app.config.ts`. Las funciones puras de `fechaHoraActividad.ts` evitan depender de la zona horaria del dispositivo. Este ajuste se verificó en el emulador Android; iOS sigue pendiente de prueba en dispositivo/simulador.

## Destino provisional sin Google Maps

Cuando falta configuración de Google o una consulta devuelve un error de indisponibilidad de Maps, web y mobile muestran el destino provisional configurado y el aviso: «La búsqueda de ubicaciones no está disponible por el momento. Vamos a usar una ubicación por defecto como destino. Como organizador, tenés que editar esa ubicación más adelante. El origen es opcional si no tenés vehículo propio». La excepción solo se aplica al destino: un conductor debe seleccionar un origen válido, incluso si el destino es provisional. Si Maps no permite seleccionar un origen y aún no hay uno elegido, no puede confirmarse el alta con vehículo propio. Los demás campos y validaciones siguen siendo obligatorios según corresponda.

La API publica el identificador reservado y las coordenadas en `destinoPorDefecto` de las opciones; al guardar usa la ubicación configurada en `api/.env`, validada en `config/env.ts` e inyectada al servicio, sin confiar en coordenadas enviadas por el cliente. Las variables `ACTIVIDAD_DESTINO_PROVISIONAL_LAT`, `ACTIVIDAD_DESTINO_PROVISIONAL_LNG` y `ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO` son obligatorias: la API no arranca si faltan, están vacías o no cumplen sus rangos/formato. El administrador debe mantener coherencia entre las coordenadas y el departamento; no se geocodifica el destino provisional cuando Maps está caído. `api/.env.example` conserva la ubicación acordada como configuración inicial. Reiniciar la API después de editarla.

El identificador reservado y el aviso de edición posterior siguen siendo parte del contrato. El identificador se rechaza cuando Maps está disponible y nunca se acepta como origen. La migración nueva `004_cu10_origen_opcional_destino_provisional.sql` permite el origen nulo, conserva 14 decimales del destino y agrega `destino_provisional`; el reintento conserva esa marca incluso si Maps vuelve a estar disponible. La confirmación informa que el destino debe editarse después.

La disponibilidad corresponde a la configuración y al último resultado conocido del proveedor, sin consultas de sondeo adicionales. Un error de ubicación inválida (400/404) no habilita el destino provisional; las fallas tipadas 503 de Maps sí. «Reintentar Google Maps» permite buscar nuevamente: una consulta exitosa restablece la disponibilidad y vuelve a usarse el selector real. El usuario puede quitar un origen que hubiera seleccionado antes. No se implementó en este cambio la pantalla de edición posterior.

## Configuración para probarlo con Google real

El [inventario de SDK, servicios y configuración de Google Maps](google-maps-integracion.md) reúne las dependencias, las APIs habilitadas, las variables y los momentos en que se realizan solicitudes.

### Selección alternativa con pin (web)

La web conserva la búsqueda de lugares y agrega «Marcar en mapa» para origen y destino. Carga el SDK de Maps solo al abrir el mapa; permite colocar el pin con un clic, arrastrarlo o ajustarlo con las flechas. «Usar este punto» consulta la API y confirma la selección únicamente si Google identifica Uruguay y un departamento. Mover el pin no genera consultas de geocodificación.

El botón «Usar mi ubicación», dentro del mapa, solicita una posición del dispositivo únicamente al pulsarlo y con el permiso del navegador. Centra el mapa y coloca el pin, informa la precisión aproximada y mantiene la confirmación explícita con «Usar este punto». Denegar el permiso, no disponer de ubicación o agotar el tiempo de espera no borra el pin anterior. Salir del mapa o elegir otro punto cancela el procesamiento de una respuesta tardía. No se usa seguimiento continuo de ubicación.

El pin usa un `OverlayView` de Google Maps con eventos de puntero y teclado propios: no requiere Map ID, `DEMO_MAP_ID` ni marcadores avanzados. La clave de navegador se configura en `FaltaUno-Web/.env` como `VITE_GOOGLE_MAPS_API_KEY`, con Maps JavaScript API habilitada y restricciones para los dominios de la web. La clave del backend necesita Geocoding API además de Places API (New). Se recomienda separar las claves de cliente y servidor; las variables `VITE_*` son públicas. El archivo web del ZIP recibido suministró la clave usada en la comprobación local.

El contrato conserva los place IDs para lugares. Para un pin se envía `origenCoordenadas` o `destinoCoordenadas` con `{ lat, lng }`, dejando el correspondiente place ID en null. El servidor rechaza selecciones ambiguas, coordenadas fuera de rango y puntos que el proveedor no identifique como pertenecientes a Uruguay con un departamento. La dirección obtenida puede ser una referencia cercana, pero no sustituye las coordenadas elegidas. El alta repite la geocodificación y conserva el mecanismo de idempotencia; las fallas tipadas `PUNTOS_*` previas a persistir permiten corregir o reintentar el formulario.

No requiere otra migración de base: usa las columnas existentes de origen/destino, con su precisión vigente (6 decimales para origen, 14 para destino).

### Selección alternativa con pin (mobile)

Ampliación solicitada el 11/11/2026 después de priorizar la web: mobile conserva el buscador y suma «Marcar en mapa» para origen y destino. Abre un modal de pantalla completa con `react-native-maps` 1.29.11 y el proveedor Google en Android/iOS. Permite tocar para colocar el pin, mantenerlo presionado para arrastrarlo y marcar el centro. El centro inicial viene de las opciones del servidor o del lugar previamente seleccionado; no agrega coordenadas geográficas fijas al cliente.

«Usar mi ubicación» usa `expo-location` ~58.0.21, solicita permiso de primer plano únicamente al pulsarlo, obtiene una posición y coloca el pin, informando la precisión disponible. No solicita ubicación en segundo plano ni inicia seguimiento continuo. Denegar permiso, apagar servicios, superar 15 segundos esperando la posición o recibir coordenadas inválidas mantiene la alternativa manual. Cerrar el modal o marcar manualmente descarta respuestas tardías. La solicitud nativa de posición no es cancelable; se cancela su procesamiento en el cliente.

«Usar este punto» llama al mismo endpoint de geocodificación inversa de la web. Si el punto cambia mientras se valida, requiere otra confirmación. El modal conserva la selección anterior hasta confirmar una nueva. El alta envía coordenadas únicamente para pines, admite combinarlas con lugares por place ID y vuelve a validarlas en la API. Los errores `PUNTOS_*` previos a persistir permiten editar y reintentar.

Las claves públicas `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` y `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` se documentan en el `.env.example` móvil y se incorporan al binario mediante el plugin de mapas en `app.config.ts`. Requieren Maps SDK for Android/iOS respectivamente. La configuración local reutiliza la clave recibida para desarrollo; deben configurarse claves por plataforma con las restricciones correspondientes antes de distribuir. Cambiar claves o dependencias nativas exige reconstruir el development build; Metro por sí solo no agrega módulos al binario instalado.

En este Windows, el build generado local usa `android.cmakeVersion=3.30.5` en `android/gradle.properties` (directorio ignorado por Git), con Ninja 1.12.1 y soporte de rutas largas ya habilitado. CMake 3.22.1 incluía un Ninja anterior que fallaba con las rutas C++ del proyecto. Un prebuild que regenere Android puede quitar ese ajuste local. Referencia: [rutas largas de Expo](https://docs.expo.dev/troubleshooting/windows-long-paths/).

### Búsqueda por lugares

1. Mantener PostgreSQL y Redis de desarrollo activos y el esquema inicial aplicado, como explica el README.
2. Configurar `GOOGLE_MAPS_API_KEY` en **`api/.env`**. Debe ser una clave de servidor de Google Maps Platform con **Places API (New)** habilitada; restringirla a esa API y a las IP del servidor según el entorno. No usar los Client ID de OAuth como clave de mapas ni pegar la clave en los clientes.
3. Reiniciar la API y abrir «Crear actividad» desde el inicio de web o mobile. Ambos clientes usan los endpoints de búsqueda de la misma API; la web usa además el SDK para el selector de pin.

La configuración local actual permitió comprobar búsquedas, apertura del mapa y confirmación de pines con Google real. Las pruebas automáticas mantienen respuestas simuladas de Google. Sin configuración válida, el formulario conserva el manejo de indisponibilidad y el destino provisional aprobado. La migración `004` (originalmente numerada `003`) se aplicó a la base de desarrollo local y, con autorización del usuario, a Supabase; debe aplicarse una sola vez en otros entornos antes de ejecutar este código.

Variables documentadas en [api/.env.example](../api/.env.example):

| Variable                                     | Valor inicial        | Uso                                                                                 |
| -------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `ACTIVIDAD_MAX_PARTICIPANTES`                | `20`                 | Máximo de participantes, incluyendo organizador e invitados.                        |
| `ACTIVIDAD_DESTINO_PROVISIONAL_LAT`          | `-34.91635775362398` | Latitud obligatoria del destino provisional, entre -90 y 90.                        |
| `ACTIVIDAD_DESTINO_PROVISIONAL_LNG`          | `-56.11543161770436` | Longitud obligatoria del destino provisional, entre -180 y 180.                     |
| `ACTIVIDAD_DESTINO_PROVISIONAL_DEPARTAMENTO` | `Montevideo`         | Departamento obligatorio, de 1 a 30 caracteres después de quitar espacios externos. |
| `IDEMPOTENCIA_HORAS`                         | `24`                 | Ventana de reserva de una misma intención de creación en Redis.                     |
| `GOOGLE_MAPS_API_KEY`                        | Vacía                | Clave privada del proveedor; se configura localmente.                               |
| `GOOGLE_MAPS_TIMEOUT_MS`                     | `8000`               | Tiempo máximo de espera por consulta de lugares.                                    |
| `LIMITE_MAPAS_SOLICITUDES_MINUTO`            | `60`                 | Límite operativo por IP para endpoints que consultan mapas.                         |

## Endpoints y archivos principales

- `GET /api/actividades/opciones`: deportes activos, niveles, cupo máximo, disponibilidad de mapas y placeholder de pronóstico.
- `GET /api/actividades/ubicaciones?texto=...&sesion=UUID`: predicciones de Google para Uruguay; requiere sesión de FaltaUno y un identificador de búsqueda.
- `GET /api/actividades/ubicaciones/punto?lat=...&lng=...`: previsualiza y valida el pin sin crear actividades.
- `GET /api/actividades/ubicaciones/detalle?placeId=...`: obtiene las coordenadas del lugar seleccionado al abrir su mapa.
- `POST /api/actividades`: requiere sesión, `Idempotency-Key` y el cuerpo documentado en Swagger; devuelve 201 con la actividad confirmada y la estimación de costo por participante actual.

El contrato completo está en [actividades.swagger.ts](../api/src/modulos/actividades/actividades.swagger.ts) y se monta en `/api/docs`. Se habilitó el encabezado de idempotencia en el preflight de CORS. Las respuestas mantienen el manejador centralizado de errores existente; Google usa timeout, validación de respuestas y logs de diagnóstico sin exponer su clave.

Archivos para seguir el flujo y poner breakpoints:

| Paso            | API                                                            | Cliente                                                                                        |
| --------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Formulario      | Opciones y contrato en `actividades.dto.ts`                    | Web `src/paginas/CrearActividadPage.tsx`; mobile `src/componentes/FormularioActividad.tsx`.    |
| Preparar pedido | Validación del controlador                                     | `src/comun/formularioActividad.ts`: fecha, dinero y datos; `src/api/actividades.ts`: petición. |
| Autenticación   | `crearRequiereSesion`, luego `ActividadesServicio.crear`       | `src/api/cliente.ts` agrega token y clave, y trata 401.                                        |
| Lugares         | `GoogleMaps.resolver` en `api/src/infra/google-maps.ts`        | `SelectorUbicacion` descarta búsquedas anteriores y requiere elegir una sugerencia.            |
| Persistencia    | `enTransaccion` -> `bloquearAlta` -> `buscarCreada` -> `crear` | Espera confirmación; conserva la intención si el resultado es desconocido.                     |
| Respuesta       | DTO con identificador, estado y cupos                          | Confirmación Programada, participantes y costo orientativo.                                    |

Observer no se agregó al alta: no hay varios suscriptores independientes en este alcance y la incorporación del organizador es parte de la transacción. Se mantienen las capas, entidades, repositorios, inyección y errores tipados.

## Alcance de la idempotencia

Redis conserva la relación **usuario + clave + huella del pedido -> UUID de actividad**. SET NX evita dos reservas distintas para una misma clave; un contenido diferente con la misma clave devuelve 409. Un bloqueo transaccional de PostgreSQL por ese UUID serializa los envíos concurrentes, y la consulta por la PK permite recuperar una confirmación perdida. El reintento conserva el UUID aunque una escritura anterior haya revertido.

No se agregó una tabla, columna ni migración de idempotencia. La protección está acotada a la ventana y supervivencia del registro de Redis: una clave vencida o perdida ya no relaciona el nuevo pedido con el UUID anterior. Los clientes conservan la intención mientras el formulario sigue abierto; una recarga que descarte ese estado inicia otra intención. No se presenta esta solución como garantía durable entre las dos bases ni como deduplicación de actividades que el usuario cree intencionalmente por separado.

## Verificación y pendientes

Consultar [casos y resultados](testing/cu10-casos-prueba.md). Se verificaron reglas, HTTP, transacciones, concurrencia, Redis, costo, hora, interfaz web y empaquetado Android. Las pruebas automatizadas usan Google simulado; la integración usa PostgreSQL y Redis reales en destinos locales aislados. La verificación visual posterior del mapa y del pin usó Google real, sin crear actividades en Supabase.

Quedan para ejecución del equipo: prueba con el GPS real del usuario, prueba funcional completa en un dispositivo Android, prueba cruzada por otro integrante, revisión/CI remoto y UAT cuando corresponda. El bundle Android es una comprobación de empaquetado, no una prueba en un celular ni un APK firmado.

Los tres repositorios están en ramas locales `feature/cu10-crear-actividad`. No se hicieron commits, push, merge ni despliegues. Se conservaron los cambios y archivos previos del usuario.

Referencias del proveedor: [Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete), [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details) y [atribución de Google Maps](https://developers.google.com/maps/documentation/places/web-service/policies).
