# Integración de ubicaciones con Google Maps

Inventario de la implementación local de CU10, revisado el 11/11/2026. Complementa [el funcionamiento de CU10](cu10-implementacion.md) y [sus pruebas](testing/cu10-casos-prueba.md). No contiene claves ni credenciales.

## SDK y dependencias

| Componente                     | Dependencia o API                                        | Uso actual                                                                                                                               |
| ------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Web                            | `@googlemaps/js-api-loader` (`^2.1.3` en `package.json`) | Carga diferida de Maps JavaScript API al abrir el selector con pin.                                                                      |
| Web                            | Maps JavaScript API, biblioteca `maps`, canal `weekly`   | Dibuja el mapa; usa `Map` y un pin propio basado en `OverlayView`. Idioma español y región UY.                                           |
| Web, desarrollo                | `@types/google.maps` (`^3.66.10` en `package.json`)      | Tipos de TypeScript; no agrega un servicio ni solicitudes en ejecución.                                                                  |
| API                            | `fetch` de Node y endpoints REST de Google               | Autocomplete, Place Details y geocodificación inversa. No se instaló un SDK de Maps para Node.                                           |
| Mobile                         | `react-native-maps` (`1.29.11`)                          | Mapa nativo de Google en Android/iOS, con pin y arrastre. La búsqueda por nombre sigue pasando por FaltaUno-API.                         |
| Mobile                         | `expo-location` (`~58.0.21`)                             | Posición única solicitada por el usuario, con permiso de primer plano y sin seguimiento continuo.                                        |
| Web, ubicación del dispositivo | `navigator.geolocation.getCurrentPosition`               | API del navegador, independiente del SDK de Google. Se solicita una posición al pulsar «Usar mi ubicación»; no hay seguimiento continuo. |

Los rangos anteriores salen de los `package.json` de web y mobile; las versiones exactas de los paquetes npm están en sus `package-lock.json`. Las versiones móviles se instalaron con `expo install` para SDK 58. El canal `weekly` del SDK remoto web se configura en `src/infra/google-maps.ts`, por lo que su versión no queda fijada por el lockfile de npm.

## Servicios de Google y cuándo se consultan

| Servicio                                | Operación y endpoint de Google                                       | Qué la dispara                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maps JavaScript API                     | Carga de la biblioteca `maps` en el navegador                        | Abrir «Marcar en mapa». La búsqueda por nombre no carga este SDK.                                                                                              |
| Maps SDK for Android / Maps SDK for iOS | SDK nativo mediante `react-native-maps`                              | Abrir «Marcar en mapa» en mobile. No utiliza la biblioteca JavaScript del navegador.                                                                           |
| Places API (New)                        | `POST https://places.googleapis.com/v1/places:autocomplete`          | Buscar un lugar por texto desde web o mobile, pasando por la API. Se envían `sessionToken`, idioma español y restricción de región UY.                         |
| Places API (New)                        | `GET https://places.googleapis.com/v1/places/{placeId}`              | Resolver un lugar al crear la actividad o centrar el mapa en un lugar previamente seleccionado. Solicita `formattedAddress`, `location` y `addressComponents`. |
| Geocoding API                           | `GET https://maps.googleapis.com/maps/api/geocode/json` con `latlng` | Confirmar «Usar este punto» y volver a validar ese punto al crear la actividad. Comprueba país y departamento y conserva las coordenadas elegidas.             |

Arrastrar el pin o ajustarlo con el teclado no llama al endpoint de geocodificación de la API. «Usar mi ubicación» obtiene coordenadas del dispositivo y coloca el pin; su validación con Google ocurre al confirmar el punto. El alta vuelve a resolver las ubicaciones en el servidor. Recuperar un alta ya confirmada mediante su clave de idempotencia no vuelve a consultar Google.

El buscador envía un token a Autocomplete; actualmente la resolución de Place Details no lo recibe. No debe suponerse que la implementación completa una sesión de facturación de Places. Este inventario describe las llamadas del código: no fija tarifas, franquicias ni una estimación de consumo.

## Configuración por entorno

| Repositorio / variable                                            | Servicios que debe permitir      | Restricción prevista                                                                                             |
| ----------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `FaltaUno-API/api/.env`: `GOOGLE_MAPS_API_KEY`                    | Places API (New) y Geocoding API | Clave de servidor, restringida a estas APIs y a las IP de salida correspondientes al entorno.                    |
| `FaltaUno-Web/.env`: `VITE_GOOGLE_MAPS_API_KEY`                   | Maps JavaScript API              | Clave pública de navegador, restringida a los dominios autorizados y a esta API.                                 |
| `FaltaUno-Mobile/.env`: `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` | Maps SDK for Android             | Clave pública incorporada al APK, restringida por paquete `uy.faltauno.app` y SHA-1 de la firma correspondiente. |
| `FaltaUno-Mobile/.env`: `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`     | Maps SDK for iOS                 | Clave pública incorporada al IPA, restringida por bundle `uy.faltauno.app`.                                      |

Se recomienda usar claves distintas para servidor, navegador, Android e iOS dentro del proyecto de Google Cloud acordado por el equipo. Las variables `VITE_*` y `EXPO_PUBLIC_*` se incorporan al cliente y son públicas. La configuración local recibida permitió comprobar el mapa web y los servicios reales; este documento no certifica las restricciones actuales de las claves en Google Cloud. Las claves móviles se cargan mediante el plugin nativo en `app.config.ts`; modificarlas requiere reconstruir el binario. El usuario mostró ambos SDK nativos habilitados en Google Cloud.

El pin propio no requiere Map ID ni Advanced Markers. Los Client ID y las librerías del inicio de sesión con Google pertenecen a la autenticación y no sustituyen las claves de Maps.

## Archivos para mantenimiento

Para revisar solicitudes, errores y latencia, abrir el [dashboard de uso de Google Maps Platform](https://console.cloud.google.com/project/_/google/maps-apis/metrics) y seleccionar el proyecto del equipo. Permite filtrar por API y credencial. Referencia: [reportes oficiales de Google Maps](https://developers.google.com/maps/reporting-and-monitoring/reporting).

- API: `api/src/infra/google-maps.ts` (Places), `api/src/infra/google-geocoding.ts` (puntos) y `api/src/modulos/actividades/actividades.servicio.ts` (caso de uso e inyección).
- Web: `src/infra/google-maps.ts` (carga del SDK), `src/infra/marcador-pin.ts` (pin), `src/infra/geolocalizacion.ts` (ubicación del dispositivo) y `src/componentes/MapaUbicacion.tsx` (interacción).
- Mobile: `app.config.ts` (plugins y claves), `src/componentes/MapaUbicacion.tsx` (mapa nativo), `src/infra/geolocalizacion.ts` (adaptador Expo) y `src/comun/ubicacionDispositivo.ts` (permisos, tiempo de espera y descarte de respuestas canceladas).
- Web y mobile: `src/componentes/SelectorUbicacion.tsx` y `src/api/actividades.ts` (buscador y contrato HTTP).

Las pruebas automáticas simulan Google y la ubicación del dispositivo. La prueba visual del mapa y la confirmación del pin usaron Google real; el GPS real del usuario sigue pendiente de prueba. El detalle de resultados está en el documento de pruebas de CU10.
