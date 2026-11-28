# Testing CU42

La evidencia corresponde al alcance completo de **Ver mis actividades iniciadas**, incluida la etiqueta verde `es hoy!` y el banner de Explorar con el texto solicitado. El anteproyecto final integra la ficha en el Anexo I y esta ejecución en el Anexo IV, antes del manual de deploy.

Las pruebas funcionales usan HTTP y PostgreSQL reales en un esquema temporal de `faltauno_test`, más Redis local `/14` para las sesiones del entorno de captura. Las pruebas de API usan Redis `/15` y esquemas propios. Los errores 503, 401 y las respuestas incompletas se provocan exclusivamente en ese entorno local.

La actividad de demostración que el usuario pidió crear en la base habitual se conserva. Tras las capturas de Android se restaura la conexión al puerto 3000 y la cuenta de Elian.

## Archivos

- `api-resultados.json`, `api-suite.log`, `web-suite.log` y `mobile-suite.log`: resultados de las suites completas.
- `web-ejecucion.json` y `android-ejecucion.json`: resultados funcionales por caso y plataforma.
- `casos.json`: fichas consolidadas con datos, pasos, resultados esperados y obtenidos.
- `capturas/`: capturas originales y derivados encuadrados para el Word.
- `verificacion-documento.json` y `paginas-verificadas.json`: preservación de contenido y localización de las secciones.
- `Anteproyecto_FaltaUno_CU42_y_testing_2026-11-27.docx`: documento final con la especificación y las evidencias integradas.

Para repetir la captura, iniciar `api/test/cu42.visual.ts` desde el repositorio API, mantener la web en el puerto 5176 y Metro en el 8082, y ejecutar `verificar-web.cjs`, `verificar-android.ps1` y `actualizar-android.ps1` en ese orden. El código de captura web dirige las llamadas de API al puerto local 3002. Android usa temporalmente `adb reverse` y vuelve a la API habitual al terminar.

La ejecución no acredita iOS ni revisión cruzada por otro integrante. Las tres pruebas de integración de notificaciones que necesitan MongoDB de pruebas se registran como omitidas, no como aprobadas.
