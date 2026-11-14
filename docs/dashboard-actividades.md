# Dashboard de actividades y filtros de sesión

Comportamiento acordado e implementado en API, web y mobile:

1. Actividades que estoy gestionando.
2. Actividades a las que estoy unido (sin repetir las que organizo).
3. Actividades que podrían interesarte: las demás actividades disponibles, excluyendo las dos secciones anteriores.

Cada sección tiene su propia paginación de diez elementos y su propio estado de carga, error, reintento y vacío. Se conserva el criterio temporal de la búsqueda existente: actividades programadas y futuras. Las propias se incluyen aunque estén completas; las ajenas requieren cupos libres. El historial de terminadas continúa en el perfil.

Las tarjetas muestran el traslado antes de unirse: «Buscando traslado» cuando `requiereVehiculo` es verdadero y «Con locomoción» cuando `tieneVehiculo` es verdadero. Son indicadores independientes declarados por el organizador; pueden mostrarse juntos. Si ninguno está marcado, no se infiere una situación de traslado. Tener vehículo no garantiza asientos disponibles.

Los filtros afectan únicamente a «Actividades que podrían interesarte». La primera visita de una sesión obtiene los deportes de interés de `GET /api/usuarios/yo/perfil`. Si no hay deportes de interés, no se limita por deporte. Después prevalece la selección aplicada por el usuario, incluso si desmarca todos los deportes. Limpiar/restablecer deja los filtros vacíos.

Los filtros se almacenan junto con la sesión existente: `localStorage` en web y `expo-secure-store` en mobile. Se recuperan al navegar, recargar o reabrir la aplicación, y se descartan al cerrar sesión, al recibir un vencimiento de sesión o al iniciar otra sesión/cuenta. No se sincronizan entre dispositivos. No se guardan ubicación ni resultados. Los errores al obtener los intereses muestran reintento y no sustituyen silenciosamente los filtros por una búsqueda general.

## Contrato y depuración

`GET /api/actividades` acepta `grupo=gestionando|unido|otras`, además de los filtros existentes. El usuario se toma de la sesión autenticada. Si se omite `grupo`, conserva la búsqueda general anterior. La respuesta mantiene `{ actividades, pagina, hayMas }`.

Cada actividad del listado incluye `tieneVehiculo` y `requiereVehiculo`, leídos respectivamente de `organizador_tiene_vehiculo` y `requiere_vehiculo`. Los clientes validan ambos booleanos antes de mostrar las tarjetas. No requiere migración ni consultas adicionales por actividad.

Flujo de API: `ActividadesControlador.buscar` → `ActividadesServicio.buscar` → `ActividadesRepositorio.buscarDisponibles` → `agregarFiltros`. Las condiciones de relación se resuelven en SQL con `EXISTS`, usando los índices existentes; no se consulta por cada tarjeta y no se agregan migraciones. Es una consulta directa, sin eventos nuevos ni observadores de dominio.

En ambos clientes, `useFiltrosDeSesion` restaura/inicializa la selección; `almacenSesion` la persiste y la elimina junto con la sesión; `useActividadesPorGrupo` consulta cada sección. En web se conserva la aplicación automática de filtros válidos después de 350 ms; en mobile se aplican desde el panel. Mobile usa una sola `SectionList` y refresca las secciones al volver al dashboard, conservando los filtros.

En el formulario de creación, «Traslado» aparece antes de «Recorrido» para decidir si hay vehículo antes de elegir origen y destino. Los textos visibles, botones y mensajes de validación usan «Participantes externos»; los nombres internos del contrato se conservan.

## Validación local del 14/11/2026

- API: lint, formato, compilación y 197 pruebas aprobadas, incluidas integración real del dashboard y de CU10 contra `faltauno_test` local y Redis `/15`. Cobertura de líneas de servicios: 98,05 %.
- Web: lint, formato, compilación y 32 pruebas aprobadas.
- Mobile: lint, formato, tipos y 36 pruebas aprobadas.
- Las pruebas de sesión verifican recuperación tras recarga, selección vacía, actualización del usuario, sesión nueva, otra cuenta, vencimiento, datos inválidos y cierre concurrente con un guardado.
- Las pruebas SQL verifican grupos excluyentes, aislamiento por usuario, propias completas, exclusión de pasadas/canceladas, organizador eliminado, filtro de deportes y paginación independiente.
- Las pruebas de traslado verifican las cuatro combinaciones de vehículo propio y búsqueda de traslado, tanto en la respuesta del servicio como en el listado desde PostgreSQL antes de unirse.

El usuario confirmó conformidad con los cambios al verificarlos en esta sesión. Quedan pendientes la revisión y pruebas cruzadas por otro integrante y el CI remoto. El documento Word mencionado en la guía del proyecto no estaba disponible en las ubicaciones locales consultadas; se usaron el código, los contratos y el acuerdo de esta tarea como fuentes.
