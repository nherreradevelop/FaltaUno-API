# Evidencia de CU26 del 22 de noviembre de 2026

Responsable de ejecución: Codex. Datos ficticios, PostgreSQL local `faltauno_test` y Redis local `/15`; esquemas efímeros independientes y eliminados al finalizar. MongoDB local para la regresión de notificaciones. No se realizaron pagos reales ni escrituras de prueba en Supabase.

El documento Word de evidencia reproduce los campos del Anexo IV del archivo aportado por el usuario: resumen ID/Caso/Flujo/Estado, y fichas ID, Caso de uso / flujo, Precondiciones, Datos de entrada, Pasos, Resultado esperado, Resultado obtenido, Estado y Fecha. El documento original se conserva intacto.

## Fuentes de resultados

- `cu26-jest-resultados.json`: salida de Jest con nombres y estados reales de toda la suite.
- `api/test/pagos.integracion.test.ts`: HTTP, permisos, deuda, concurrencia, versiones, rollback y retención.
- `api/test/pago.entidad.test.ts`: importes exactos y máximos.
- `test/pagos.test.mjs` en web y mobile: sugerencia, validación y máximo de edición.
- Capturas `cu26/pago-parcial-web.jpg`, `cu26/confirmacion-perdida-web.jpg` y `cu26/pago-verificado-web.jpg`: navegador contra API temporal 3001 y web temporal 5174, usando `api/test/gastos.visual.ts`.

## Secuencia observada en web

1. Deuda ficticia de Bruno a Ana por $ 1.200; Ana, que recibe, abre Registrar pago y obtiene el total sugerido.
2. Cambiar el importe y cancelar conserva la deuda y no genera historial.
3. Ingresar $ 1.200,01 muestra el máximo $ 1.200 y no envía un pago válido.
4. Registrar $ 300 muestra éxito, deuda $ 900 y un pago en el historial.
5. Editar ese pago a $ 450 ofrece un máximo de $ 1.200, excluyendo su efecto anterior; deja deuda $ 750.
6. Cancelar la confirmación de eliminación conserva el pago. Confirmarla después elimina el pago y restituye deuda $ 1.200.
7. El fixture confirma otro pago de $ 500 y sustituye deliberadamente su respuesta por HTTP 503. La interfaz conserva el monto y ofrece Verificar resultado con el formulario bloqueado.
8. Verificar recupera ese único pago y muestra deuda $ 700, sin descontarlo dos veces.

## Límites de la evidencia

Android nativo se verificó además en el emulador API 37 mediante diez comprobaciones de registro, cancelación, importe inválido, pago parcial y total, edición, eliminación, respuesta perdida, archivo y vencimiento de retención. El registro está en `cu26/mobile-ejecucion-2026-11-22.json`. La prueba iOS sigue pendiente: este entorno Windows no tiene dispositivo ni simulador iOS disponible. CI remoto y revisión humana permanecen pendientes. Las migraciones 005–007 ya se aplicaron en Supabase por pedido del usuario; el recibo está en `cu26/migracion-supabase-2026-11-22.json`.

El renderizador DOCX empaquetado falló porque no hay `soffice.exe` disponible. La referencia se abrió en Word en modo solo lectura y se exportaron sus páginas 325–328; la salida final se verifica exportándola con Word a PDF y renderizando sus páginas a PNG con Poppler empaquetado. Los archivos de QA son temporales y no forman parte de la entrega.

## Resultado final

API: 327 pruebas aprobadas en 26 suites; cobertura de líneas del servicio de pagos 98,96 %. Web: 88 pruebas; mobile: 82 pruebas. Build de API/web, tipos mobile, lint y bundle Android correctos. Evidencia Word ampliada con la ejecución Android y capturas, revisada mediante exportación de solo lectura y PNG. El original conserva su hash SHA256.
