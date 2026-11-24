# Actualización automática de gastos, pagos y balances

Fecha: 23/11/2026. Responsable: Codex. Alcance autorizado: reflejar cambios desde otra sesión en web y mobile, conservando el botón de actualización como respaldo.

## Implementación

- Los servicios emiten eventos de gastos y pagos después de confirmar la transacción. Los reenvíos idempotentes, las ediciones sin cambios y los rollbacks no emiten nuevos eventos.
- `conectarActualizacionesFinancieras`, en `api/src/suscripciones.ts`, conecta ambos dominios al mismo Observer. El repositorio consulta los participantes actuales de la actividad en una sola consulta.
- Socket.IO envía `finanzas:actualizadas` a las salas autenticadas de esos usuarios, incluyendo otras sesiones del propio autor. El único dato transmitido es `actividadId`; no se publican importes, partes, autores ni identificadores de pagos. Las consultas HTTP siguen aplicando todos los permisos y la privacidad del historial.
- Web y mobile reutilizan el socket de notificaciones. Un hook por actividad escucha las invalidaciones y refresca gastos/pagos/balances en segundo plano. También recupera cambios al conectar o reconectar y al volver a primer plano.
- Los avisos agrupados durante 100 ms comparten una consulta; si llega un cambio durante un GET se vuelve a consultar después. Las respuestas antiguas no pisan consultas más recientes y las páginas antiguas no se anexan después de un refresco.
- Los detalles en lectura vuelven a consultar el registro seleccionado. Los formularios y las confirmaciones conservan su borrador y versión; los conflictos siguen requiriendo revisión explícita. La actualización no elimina intenciones pendientes de verificación.
- Cada listener y temporizador se retira al desmontar/cerrar sesión. No se agregaron dependencias ni migraciones.

El canal en vivo actual usa una instancia de API, como el Docker de desarrollo. Los avisos son transitorios: una desconexión se recupera consultando el estado actual al reconectar/volver a la aplicación. Un despliegue con varias instancias necesitaría distribuir también estos eventos entre procesos.

## Validación automática

| Área                                 | Resultado                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| API completa, bases locales aisladas | 331 pruebas aprobadas en 27 suites                                                       |
| Cobertura de servicios API           | 98,45 % de líneas; pagos 99 %                                                            |
| Web                                  | 94 pruebas aprobadas                                                                     |
| Mobile                               | 88 pruebas aprobadas                                                                     |
| Compilación y controles              | API build/types/lint; web build/types/lint; mobile types/lint y bundle Android aprobados |

Pruebas agregadas:

- Observer: suscripción de ambos dominios, limpieza y payload sin datos de pagos.
- Integración PostgreSQL/Redis/HTTP/Socket.IO reales: alta, edición y baja de gastos y pagos; actualización de otra sesión del mismo autor y de otro participante; ningún aviso a un usuario ajeno; balances confirmados para cada paso.
- Pagos: no hay evento para reenvíos, edición idéntica ni fallo SQL anterior al commit.
- Clientes: filtrar actividad/usuario, agrupar ráfagas, reconectar/volver a primer plano, recuperar un cambio durante un GET, ignorar mensajes inválidos y cancelar suscripciones/consultas pendientes al desmontar.

Las pruebas no escribieron datos de negocio en Supabase. Android fue compilado; este cambio no se volvió a ejecutar en emulador ni en iOS.

## Verificación visual web

API temporal en 3001, Vite temporal en 5175, esquema PostgreSQL local `gastos_visual_a6591b86939e4b51a4257f73694dd3fc`. Ana en el navegador; operaciones HTTP autenticadas como Bruno en otra sesión. Ambos usuarios y la actividad son ficticios.

| Caso  | Acción en la otra sesión                                                       | Resultado observado sin tocar Actualizar                                                                                     |
| ----- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| RT-01 | Crear gasto de $180                                                            | Aparece la fila; deuda $1.200 → $1.380                                                                                       |
| RT-02 | Registrar pago de $300                                                         | Aparece en Mis pagos; deuda $1.380 → $1.080                                                                                  |
| RT-03 | Editar pago de $300 a $450 con el detalle abierto en Ana                       | El detalle muestra $450; deuda $930                                                                                          |
| RT-04 | Abrir un borrador en Ana; editar gasto de $180 a $250 y eliminar pago en Bruno | Concepto y monto escritos en el borrador permanecen intactos; al cancelar, gasto actualizado, historial vacío y deuda $1.450 |
| RT-05 | Eliminar gasto de $250 y registrar pago de $300                                | Desaparece el gasto; aparece el pago; deuda $900                                                                             |

Se conservaron los botones de actualización como respaldo. Captura final: `cu26/actualizacion-entre-sesiones-web.jpg`.

Se verificó la sincronización de los archivos en los contenedores habituales API, web y Metro. La API se reinició para registrar los nuevos observers. La versión web habitual continúa en `http://localhost:5173`.

Al terminar se detuvieron Vite 5175 y la API temporal 3001, se retiró el esquema local de la prueba y se cerraron las sesiones ficticias de Ana y Bruno. La actividad de Elian en Supabase permanece disponible para las pruebas del usuario.

## Depuración

1. `GastosServicio.ejecutar` / `PagosServicio.ejecutar`: emisión después del retorno de la transacción.
2. `conectarActualizacionesFinancieras` y `FinanzasTiempoRealObservador.actualizar`: destinatarios y envío a salas de usuario.
3. `conectarActualizacionesFinancieras` en `src/comun/actualizacionesFinancieras.ts` de cada cliente: recepción del evento y reconexión.
4. `suscribirActualizacionFinanciera` → `useActualizacionFinanciera` → `useGastos.recargar` / `usePagos.recargar`: consulta y actualización del estado.
