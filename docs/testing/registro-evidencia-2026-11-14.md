# Evidencia guardada de CU08 CU09 CU10 y CU37

Estado más reciente: se implementaron H01 (web y Android) y H03 (web) y se repitieron las pruebas: **336 aprobadas, 0 fallidas, 0 omitidas**. Las correcciones H02/H04 están incluidas y H05 se conserva como esperado. Consultar la carpeta hermana `correcciones-detalle-sesion` dentro del mismo directorio persistente: `RESULTADO.md`, `resultado.json`, parches, capturas y `Correcciones_y_regresion_2026-11-14.zip`. Los worktrees web/mobile están en `codex/corregir-detalle-cierre-sesion`, sobre las versiones CU37; sin commit, push ni integración en develop. La API sigue sin cambios de producto. Las notas siguientes son históricas.

Actualización posterior del usuario: H05 se reclasifica como comportamiento esperado (abrir Explorar tras el login). H02 y H04 tienen correcciones locales en worktrees de los frontends, rama `codex/corregir-fechas-teclado`, dentro de la carpeta hermana `correcciones-2026-11-14`. Allí están `PROPUESTAS.md`, `resultado.json`, los parches y las capturas de regresión. H01 y H03 siguen como propuestas sin implementar. La evidencia original que se describe abajo se conserva como registro histórico.

Se rehizo la evidencia del frontend en web y Android nativo y se guardaron cuatro documentos Word con 53 fichas, capturas actuales, registros y cinco hallazgos.

Ubicación persistente en este equipo:

`C:\Users\Usuario\.codex\visualizations\2026\11\14\01a1dc4d-48ef-7150-bc6a-9f06bfd37b7c\testing-2026-11-14`

Abrir `INDICE.md` para consultar los cuatro documentos de `documentos`, `hallazgos.md`, `casos.json`, `manifiesto.json` y las capturas originales. La entrega portable está en `Entrega_testing_CU08_CU09_CU10_CU37_2026-11-14.zip`.

API original: develop `00a73753`. Evidencia con CU37: snapshots API `981dadc`, web `99e9c0c`, mobile `dc97273` en un entorno local aislado. No se cambió el código de producto ni se hizo commit o push.

Hallazgos: H03 P1 restauración de sesión web ante doble falla; H01 respuesta inválida rompe detalle; H02 teclado tapa campos Android; H04 fecha y hora difieren entre listado y detalle; H05 enlace Android pierde destino después del login.

Quedaron pendientes OAuth Google, Places real, CU15 y CU22. Los documentos distinguen casos aprobados, parciales, fallidos y pendientes. Las 272 pruebas automáticas aprobadas (203 API, 32 web, 37 móvil) son validación complementaria.

Integración a develop solicitada: PR API #7, web #6 y mobile #6 actualizados, CI en verde. GitHub exige revisión de otro integrante; todavía no están mergeados. Estado detallado: C:\Users\Usuario\.codex\visualizations\2026\11\14\01a1dc4d-48ef-7150-bc6a-9f06bfd37b7c\correcciones-detalle-sesion\integracion\ESTADO.md

Último documento integral actualizado: C:\Users\Usuario\.codex\visualizations\2026\11\14\01a1dc4d-48ef-7150-bc6a-9f06bfd37b7c\documento-actualizado\FaltaUno_documento_actualizado_evidencia_CU08_CU09_CU10_CU37.docx. Basado en la versión (4) del usuario; evidencia CU08 CU09 CU10 CU37 incorporada con capturas y regresión. Índice actualizado. Registro de integridad: C:\Users\Usuario\.codex\visualizations\2026\11\14\01a1dc4d-48ef-7150-bc6a-9f06bfd37b7c\documento-actualizado\manifest.json

Ampliación del 15/11/2026: API ejecutada en Postman Desktop, Collection Runner, en el nuevo espacio privado **FaltaUno Evidencia API 2026 11 15**. Resultado: 50 solicitudes principales (dos de preparación y 48 casos), 120 comprobaciones aprobadas, cero fallidas, omitidas o errores de ejecución. Se guardaron 52 capturas originales. Incluye filtros, detalles, creación, idempotencia, revocación e independencia de sesiones y fallas controladas de PostgreSQL/Redis. Observación menor pendiente: mensajes de validación por campo en inglés.

Documento integral más reciente y evidencias: `C:\Users\Usuario\.codex\visualizations\2026\11\14\01a1dc4d-48ef-7150-bc6a-9f06bfd37b7c\postman-2026-11-15`. Consultar `LEEME.md`, `FaltaUno_documento_con_evidencia_Postman_2026-11-15.docx`, la colección importable, `resultados-transcritos.json`, `capturas/` y `manifest.json`. Los resultados transcritos se distinguen de una exportación nativa de Postman. Las pruebas de interfaz siguen fechadas el 14/11. La API continúa sin cambios de producto; las sesiones sintéticas de esta ejecución fueron invalidadas al finalizar.
