# Reejecución integral CU23–CU26 — 23/11/2026

Se ejecutaron nuevamente las suites completas, además de pruebas visuales del CRUD de gastos y pagos en web y Android nativo. Se conservaron el código funcional y la base Supabase; los datos visuales se crearon únicamente en un esquema efímero de PostgreSQL local.

| Área   | Aprobadas | Fallidas | Evidencia                                      |
| ------ | --------: | -------: | ---------------------------------------------- |
| API    |       331 |        0 | `api-resultados.json`, `api-suite.log`         |
| Web    |        94 |        0 | `web-suite.log`, 21 capturas JPG               |
| Mobile |        88 |        0 | `mobile-suite.log`, 24 capturas PNG de Android |

El Word `Evidencia_testing_CU23_CU26_2026-11-23.docx` conserva el formato de fichas del Anexo IV del documento del usuario: 27 fichas, con 26 aprobadas y una pendiente para iOS. Las 15 comparaciones de capturas web/Android están intercaladas inmediatamente después de la ficha correspondiente. Se revisaron visualmente las 34 páginas de esta versión reordenada. El ZIP entregado incluye todas las capturas originales, no solo la selección del Word.

## Alcance completo

- CU23: alta, campos inválidos, importes exactos y centésimos, pagadora invitada, responsable, permisos, estados, período, idempotencia, rollback y avisos.
- CU24: edición de gastos y pagos, cambios de reparto/pagador, máximo del pago excluyendo su efecto anterior, edición idéntica, autoría y versiones concurrentes.
- CU25: cancelar/confirmar bajas de gastos y pagos, restitución del balance, reintentos, versión anterior y rollback.
- CU26: sugerencia, parcial/total, cancelación, monto inválido, deuda saldada/inversa, estados, período, registro por cualquiera de las partes, historial privado y paginado, deuda de invitada, confirmación perdida, concurrencia, archivo y retención de seis meses calendario.
- Actualización entre sesiones: cambios de web observados automáticamente en Android y cambios nativos observados en web. Reconexión, ráfagas, aislamiento, limpieza y consultas concurrentes también están cubiertos automáticamente.

`casos.json` describe entradas, pasos, esperado, obtenido y modalidad de cada ficha. `manifiesto.json` inventaría 108 pruebas API relacionadas con los CU y sus componentes, con sus nombres y estados reales. El resto de las 331 pruebas es regresión de otros módulos; no se presenta todo ese total como casos exclusivos de gastos/pagos.

Los controles internos de permisos, concurrencia, rollback, paginación y purga se verificaron mediante API/SQL, no se presentan como recorridos visuales inexistentes. Las capturas cubren los flujos de usuario de cada cliente. `web-estado-pagos.json` y `android-estado-sql.json` registran pagos confirmados y balances de las secuencias visuales.

## Reproducir

API: configurar `POSTGRES_URL_TEST` a `faltauno_test` local, `REDIS_URL_TEST` a Redis local `/15` y `MONGO_URL_TEST` al MongoDB local de pruebas; ejecutar en `api/`:

```powershell
npm run test:cobertura -- --runInBand --json --outputFile=../docs/testing/reejecucion-2026-11-23/api-resultados.json
```

Clientes: ejecutar `npm test` en cada repositorio web/mobile. Sus logs de esta entrega se guardaron con el reporter `spec` de Node para facilitar la lectura.

Recorrido visual: `api/test/gastos.visual.ts` configura datos ficticios en la base local, API 3001 y Socket.IO; web temporal 5175 y Metro temporal 8082. Android usa el development build `uy.faltauno.app` con los puertos reversos 3001 y 8082. Archivo y vencimiento se simularon exclusivamente en ese esquema local. Al finalizar se detuvieron los procesos y el emulador, se eliminó el esquema y se cerraron ambas sesiones ficticias. Los servicios Docker habituales y la actividad de Elian se conservaron.

## Límites e incidencias

- iOS no se ejecutó: no hay dispositivo ni simulador disponible en este entorno Windows. Las pruebas de lógica mobile y la ejecución Android no se atribuyen a iOS.
- Durante la preparación, Metro informó un fallo inicial de arranque del development build. La app se relanzó antes de comenzar las pruebas nativas; los flujos documentados se completaron después. No se cambió código funcional durante esta reejecución.
- CI remoto y revisión humana no se ejecutaron como parte de esta prueba local.
- El renderizador documental empaquetado no encontró LibreOffice. Se utilizó Word instalado, en modo solo lectura, para exportar a PDF, y Poppler empaquetado para renderizar y revisar todas las páginas. La referencia original conserva su hash.
