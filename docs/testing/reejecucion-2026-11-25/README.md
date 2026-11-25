# Reejecución de CU23, CU24, CU25 y CU26 — 25/11/2026

Se repitieron las pruebas después de los cambios visuales y de integrar los commits remotos de web (`c86f12f`) y mobile (`9d3e364`). La API se probó en `0b87eaa`. Responsable de ejecución: Codex.

Revisiones finales de los clientes: web `4a6dc1b` y mobile `f593f40`, con CI de GitHub aprobado.

| Validación                             | Resultado                              |
| -------------------------------------- | -------------------------------------- |
| API, cobertura e integración local     | 405 pruebas, 34 suites, cero fallidas  |
| Web, suite completa actualizada        | 115 pruebas, cero fallidas             |
| Mobile, suite completa actualizada     | 110 pruebas, cero fallidas             |
| Compilación web y API; tipos mobile    | Aprobados                              |
| Lint y formato de los cambios          | Aprobados                              |
| Fichas CU23–26 y controles financieros | 26 aprobadas                           |
| Ejecución nativa iOS                   | Pendiente; Windows sin dispositivo iOS |

Los totales de las suites incluyen regresión de otros módulos. En el documento solo se actualizan **Testing CU23, Testing CU24, Testing CU25 y Testing CU26**. Las secciones globales y los demás CU conservan su contenido anterior.

## Recorrido ejecutado

- Alta con invitada pagadora y reparto de $150,01 en $50,01 + $50 + $50; deuda $1.250.
- Edición de pagador, reparto y total a $180,02; deuda $1.290,01. Cancelar una baja conserva el gasto; confirmarla restituye la deuda original de $1.200.
- Pago parcial de $300, edición a $450 y baja confirmada; balances $900, $750 y $1.200, respectivamente.
- Validación del importe máximo y cancelación sin escritura. En el formulario mobile actualizado se proponen el usuario pagador y el reparto inicial: se documenta esa diferencia respecto de web.
- Confirmación perdida simulada después de confirmar $500: el cliente conserva el intento; Verificar resultado recupera un único pago, con deuda $700. El pago final de $700 salda la deuda.
- Archivo reciente: historial disponible y acciones de escritura retiradas. Con siete meses simulados desde el archivo: historial vencido y saldo cero.
- Observer: gastos y pagos de Android aparecen en web sin refrescar; altas, ediciones y bajas web se reflejan en Android. Las pruebas automatizadas cubren reconexión, agrupación de eventos, autorización y limpieza de listeners.

La sincronización se acredita con **sesiones conectadas a una misma API**. Distintas instancias Docker de API no comparten el Observer en memoria; no se implementó distribución entre instancias.

## Entorno y evidencia

Docker local aislado: PostgreSQL 17, Redis 7, MongoDB 8, API de prueba, Vite y Metro con el código del host montado. Proyecto Compose `faltauno-retesting-cu23-cu26`, puertos loopback 3001/5175/8082 y esquema SQL efímero. Se usaron Ana, Bruno y Camila ficticios; no se escribieron datos de prueba en Supabase ni en la actividad compartida.

Android nativo: AVD `Medium_Phone_API_37.0`, development build `uy.faltauno.app`. Los cambios remotos de hojas modales, selección inicial y navegación se preservaron; Gastos se abre desde su sección debajo del mapa y las pestañas quedan en Participantes/Chat.

Revisión visual final: errores y restricciones de gastos/pagos en naranja en ambos clientes. En mobile, «Mis deudas pendientes» y sus bordes usan naranja; «Mis pagos» y sus tarjetas conservan verde. Los montos permanecen oscuros, sin relleno. Las suites completas se repitieron en Docker tras estos ajustes: web 115/115 y mobile 110/110.

- [Fichas y resultados](casos.json).
- [Resultado completo de Jest](api-resultados.json).
- [Estado SQL del escenario final](estado-final-sql.json).
- [Capturas originales](capturas/). Las 30 figuras seleccionadas del Word se renovaron; los recortes del documento conservan los originales.
- [Verificación estructural del Word](verificacion-documento.json): 6.106 bloques fuera del alcance idénticos y 30 imágenes exclusivas reemplazadas.
- [Verificación de render](verificacion-render.json).
- [Documento actualizado](../integracion-2026-11-24/20260826-ATI-319004-341831-247305%20%285%29.docx).

Se conservan los scripts y registros temporales de ejecución en la copia local. El fixture visual base es [gastos.visual.ts](../../../api/test/gastos.visual.ts); las pruebas de reglas, concurrencia, idempotencia, RLS y auditoría corresponden a las suites de integración de gastos y pagos de `api/test`.
