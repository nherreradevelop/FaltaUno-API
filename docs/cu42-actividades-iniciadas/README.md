# CU42 Ver mis actividades iniciadas

Implementación del alcance aprobado el 27/11/2026. API, web y móvil parten del último `origin/develop`, en la rama `codex/cu42-actividades-iniciadas` de cada repositorio.

El documento final es `../testing/cu42-2026-11-27/Anteproyecto_FaltaUno_CU42_y_testing_2026-11-27.docx`: agrega la ficha al final del Anexo I, con el orden de más reciente a más antigua solicitado el 27/11/2026, y el testing al final del Anexo IV. CU42 ocupa las páginas 335 a 338 y su evidencia las páginas 508 a 526 en Microsoft Word. Se revisaron visualmente ambas secciones y el comienzo de los anexos siguientes mediante exportación a PDF e imágenes. La verificación estructural confirma que se conservaron los bloques originales ajenos a las adiciones. También se actualizó el Word original de Descargas, conservando un respaldo previo a CU42.

## Comportamiento

“Mis actividades” muestra actividades cuyo estado persistido es `iniciada` y cuya participación corresponde al usuario autenticado, incluidas las que organiza. Se muestra nombre, deporte, departamento, inicio, estado y fecha límite de gastos y pagos. Si el inicio corresponde a hoy en Uruguay, se agrega la etiqueta verde `es hoy!`. Se puede acceder al detalle, actualizar y recorrer todas las actividades de a diez. La fecha límite reutiliza el cálculo de `Actividad`; las actividades con el plazo vencido siguen apareciendo mientras su estado sea `iniciada`.

La API resuelve `GET /api/actividades/iniciadas?pagina=1` antes de la ruta `/:id`. La consulta determina la identidad desde la sesión, ordena por inicio e ID descendentes, de la más reciente a la más antigua, y solicita once filas para devolver diez y calcular `hayMas`. Usa el índice existente de participación por usuario. No requiere migraciones, consultas por cada actividad, transacciones de escritura, cachés ni eventos Observer.

Web agrega `/mis-actividades` al menú. Móvil implementa la pestaña existente con `FlatList` y vuelve a consultar al enfocarla. Ambos validan el contrato, muestran carga, vacío y error, y conservan las páginas confirmadas ante una falla. CU14 conserva pendientes las vistas de programadas, historial, canceladas e invitaciones; CU42 no implementa las tareas de actualización de estados de CU41.

En Explorar, la respuesta de búsqueda de `grupo=otras` incluye `hayIniciadasHoy`. La API consulta con `EXISTS` si el usuario es miembro de una actividad en estado `iniciada` cuyo inicio cae entre las dos medianoches del día actual de `America/Montevideo`. Usa la identidad y el reloj del servidor. La comprobación no depende de filtros, cupos, páginas ni coincidencias de la lista visible, y se ejecuta una sola vez por consulta de ese grupo. Las otras dos secciones no repiten la comprobación. Cuando la marca es verdadera, web y móvil muestran el banner “Tenes actividades que comienzan hoy!” y el enlace “Ver mis actividades”. No se agrega una llamada HTTP del cliente.

## Validación

| Verificación                                | Resultado                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| CU42 con Jest, HTTP y PostgreSQL real       | 27 pruebas aprobadas                                                                                                 |
| Suite completa de API                       | 429 aprobadas, 3 omitidas de integración de notificaciones que requieren MongoDB de pruebas                          |
| Cobertura de líneas de servicios            | 98,71 %; `ActividadesServicio` 100 %                                                                                 |
| Suite web                                   | 121 pruebas aprobadas                                                                                                |
| Suite móvil                                 | 116 pruebas aprobadas                                                                                                |
| Compilación API y web                       | Aprobada                                                                                                             |
| Tipos móvil y lint de los tres repositorios | Aprobados                                                                                                            |
| Navegador web a 1440 y 390 píxeles          | Listado, paginación, error y reintento de la segunda página, respuesta inválida, vacío y enlace al detalle aprobados |
| Revisión en Android o iOS                   | Android aprobado: banner real con Elian, enlace a Mis actividades y actividad de hoy primero; iOS no ejecutado.      |

La prueba visual usa respuestas simuladas para aislar la interfaz; las reglas de pertenencia, estado y paginación se comprueban además con HTTP y PostgreSQL reales. Los datos de integración se crean en un esquema temporal de `faltauno_test` local y se eliminan al finalizar. Las pruebas automatizadas no usan la base compartida. Para la revisión manual solicitada por el usuario se creó en la base configurada la actividad “Actividad de prueba de hoy”, en estado Iniciada, con Elian como organizador y miembro; quedó disponible para seguir revisando el banner.

Para repetir las pruebas de API, definir `POSTGRES_URL_TEST` con `faltauno_test` en localhost y `REDIS_URL_TEST` con Redis local `/15`; ejecutar `npm run test:cobertura -- --runInBand` desde `api/`. En los clientes, ejecutar `npm test`, `npm run lint` y, respectivamente, `npm run build` o `npm run typecheck`. La revisión visual se ejecuta con `verificar-pantalla.cjs` contra la compilación web servida en el puerto 5176.

## Depuración

1. En web, `MisActividadesPage` usa `useActividadesIniciadas`; en móvil lo usa la pestaña `mis-actividades.tsx`.
2. `obtenerActividadesIniciadas` llama al cliente HTTP central y valida la respuesta.
3. El middleware `requiereSesion` determina `req.usuarioId`.
4. `ActividadesControlador.obtenerIniciadas` valida la página.
5. `ActividadesServicio.obtenerIniciadas` pide el listado y calcula el plazo mediante `Actividad.calcularFechaLimiteGastos`.
6. `ActividadesRepositorio.buscarIniciadasDeParticipante` consulta las participaciones y actividades en una única sentencia SQL.

La evidencia detallada de web y Android está en `../testing/cu42-2026-11-27/`. La revisión cruzada y la aprobación por otro integrante se completan en los pull requests hacia `develop`.
