"""Genera la evidencia usando las tablas del Word de referencia, con el runtime documental."""
from copy import deepcopy
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

BASE = Path(__file__).resolve().parent
RAIZ = BASE.parents[2]
REFERENCIA = Path('D:/Descargas/20260826-ATI-319004-341831-247305 (7).docx')
HASH = 'de7711094c3725096ad3296e1711e4f0c29f8de7bdb2db6731c0d8f36a72aa07'
SALIDA = BASE / 'Evidencia_testing_CU26_2026-11-22.docx'
assert sha256(REFERENCIA.read_bytes()).hexdigest() == HASH, 'Cambió la referencia; revisar plantilla.'

resultados = json.loads((BASE.parent / 'cu26-jest-resultados.json').read_text(encoding='utf-8'))
assert resultados['numFailedTests'] == 0
assert resultados['numPassedTests'] == 327

# Título, flujo, datos, pasos, resultado esperado, resultado obtenido y estado.
CASOS = [
    ('Pago parcial y total', 'FP / RN2–RN3',
     'API: deuda $ 3; pago parcial $ 1 y pago final $ 2. Web: deuda $ 1.200 y pago $ 300.',
     'Abrir Registrar pago desde un balance. Revisar la sugerencia. Registrar un importe parcial y consultar el balance. Completar el resto por API.',
     'Sugerir la deuda completa; cada pago reduce el balance en su importe. El pago final elimina la deuda.',
     'API: HTTP 201, deuda $ 3 → $ 2 → sin deuda. Web: sugerencia $ 1.200, pago $ 300 y balance $ 900. El historial muestra un único pago parcial.', 'Aprobado'),
    ('Cancelar registro', 'A1',
     'Web: formulario con $ 300, sobre deuda $ 1.200. API: consulta de opciones sin escritura.',
     'Abrir el formulario, cambiar el importe y pulsar Cancelar. Consultar deuda e historial.',
     'Cerrar el formulario sin crear un pago ni modificar el balance.',
     'Web conserva deuda $ 1.200 y el historial vacío. La prueba SQL confirma cero pagos después de consultar opciones y cancelar el flujo.', 'Aprobado'),
    ('Monto inválido y máximo permitido', 'E1',
     'API: cero, negativo, fracción de centésimo, texto, null, importe ausente y superior a $ 3. Web: $ 1.200,01 sobre deuda $ 1.200.',
     'Enviar cada variante. Consultar pagos y balance. En web, corregir el monto y volver a confirmar.',
     'Rechazar el monto, explicar el máximo vigente y conservar datos para corregir; no guardar efectos parciales.',
     'API responde 400 e indica máximo $ 3.00; no crea pagos y conserva deuda $ 3. Web muestra máximo $ 1.200,00; al corregir a $ 300 permite registrar.', 'Aprobado'),
    ('Deuda inexistente o saldada', 'E2 / RN1–RN2',
     'Deuda $ 3. Solicitud en dirección opuesta y nueva solicitud después de pagar el total.',
     'Intentar pagar en sentido contrario. Saldar la deuda. Intentar registrar otro pago.',
     'Informar que no existe una deuda pendiente y no registrar el nuevo pago.',
     'Ambas solicitudes reciben SIN_DEUDA_PENDIENTE; el pago total queda confirmado una sola vez y el balance permanece saldado. Verificado en integración API/SQL.', 'Aprobado'),
    ('Estado y período Iniciada', 'E3 / RN6 / Glosario',
     'Actividad archivada, programada, cancelada o con exactamente 14 días desde su inicio.',
     'Intentar registrar en cada estado. Consultar opciones y balances al vencer el período.',
     'Rechazar escrituras y conservar deudas; al archivar, permitir lectura dentro del plazo de retención.',
     'La API rechaza las escrituras con ACTIVIDAD_NO_ADMITE_PAGOS. Al cumplirse 14 días, puedeEscribir es false y la deuda sigue en $ 3, aunque CU32 no haya actualizado aún el estado.', 'Aprobado'),
    ('Falla técnica y rollback', 'ER1 / RNF-23',
     'Deuda $ 3; falla inyectada al guardar la confirmación durable, después de modificar pago y balance.',
     'Ejecutar el pago con falla. Consultar filas y balance. Restaurar el método y reenviar la misma clave.',
     'Revertir pago, balance e intención juntos; permitir un nuevo intento sin duplicados.',
     'La transacción revierte el pago y conserva deuda $ 3. La intención figura noRegistrada. Restaurado el método, el reintento confirma un único pago. Prueba con PostgreSQL real.', 'Aprobado'),
    ('Registro por cualquiera de las partes', 'RN1 / Decisión P1',
     'Pagador Bruno y receptor Ana en la misma actividad; tercer participante ajeno al balance.',
     'Registrar desde quien paga y desde quien cobra. Intentar lo mismo como tercero, sin sesión y sin participación.',
     'Permitir a ambas partes; rechazar terceros y solicitudes sin sesión o participación.',
     'API: ambas partes pueden registrar y se conserva el autor real; tercero recibe 403, falta de sesión 401. En web, Ana registra el pago recibido de Bruno.', 'Aprobado'),
    ('Historial privado y paginación', 'RN4 / Decisión P2',
     'Un pago entre Ana y Bruno y un tercer participante. Luego, 23 pagos con idéntica fecha y microsegundos.',
     'Listar y consultar detalle con cada usuario. Pedir dos páginas. Enviar un cursor inválido.',
     'Solo las partes ven cada pago. Paginar sin pérdidas ni duplicados; rechazar el cursor inválido.',
     'Ana y Bruno ven el pago; el tercero obtiene lista vacía y detalle 404. Páginas de 20 y 3 pagos, 23 IDs distintos. El cursor inválido se rechaza con 400. Verificado en API.', 'Aprobado'),
    ('Deuda de invitado externo', 'RN7',
     'Gasto de $ 5 asignado a una invitada de Ana, compensado con deuda previa de Bruno por $ 3.',
     'Consultar el balance y registrar el pago de $ 2 desde Ana a Bruno.',
     'Imputar la deuda a la responsable; no usar al invitado como parte de un pago.',
     'La API registra a la participación de Ana como pagadora y a Bruno como receptor. El pago de $ 2 salda el balance de la pareja. La invitada no figura como parte del pago.', 'Aprobado'),
    ('Reintentos y confirmación perdida', 'RNF-23',
     'Misma clave y datos concurrentes. Web: pago $ 500 con HTTP 503 deliberado después del commit.',
     'Enviar dos solicitudes iguales, consultar intención y reenviar. En web, pulsar Verificar resultado después de la confirmación perdida.',
     'Conservar una sola escritura y un solo descuento; recuperar el resultado sin cambiar clave ni datos.',
     'API devuelve el mismo pago y rechaza otro cuerpo con la misma clave. Recupera también la confirmación después del archivo, dentro de la retención. Web conserva $ 500, bloquea edición y recupera un pago; deuda final $ 700.', 'Aprobado'),
    ('Pagos concurrentes distintos', 'RN2 / RNF-23',
     'Deuda $ 3; dos pagos simultáneos de $ 2 con claves diferentes.',
     'Ejecutar ambas solicitudes y consultar el balance final.',
     'Revalidar la deuda después del bloqueo y permitir solo el pago que no la exceda.',
     'Solo una solicitud se confirma. La otra se rechaza por el máximo vigente y el balance queda en $ 1, sin pagos por encima de lo adeudado. Verificado en integración SQL.', 'Aprobado'),
    ('Editar únicamente el monto', 'RN5 / CU24 FP y E',
     'API: pago $ 1 sobre deuda original $ 3. Web: pago $ 300 sobre deuda original $ 1.200.',
     'Consultar máximo excluyendo el pago. Aumentar importe. Intentar cambiar partes, editar como no autor y usar una versión anterior.',
     'Mantener personas y actividad; solo el autor edita. Retirar efecto anterior, aplicar el nuevo y rechazar versiones obsoletas.',
     'API ofrece máximo $ 3 y permite subir a $ 2,50, dejando deuda $ 0,50. Rechaza cambio de partes, autor ajeno y versión obsoleta. Web ofrece máximo $ 1.200 y editar a $ 450 deja deuda $ 750.', 'Aprobado'),
    ('Confirmar sin cambios', 'RN5 / CU24 A2',
     'Pago vigente de $ 2,50, versión 2.',
     'Enviar el mismo importe con la versión vigente y una clave nueva.',
     'No alterar versión ni balance y responder que no hay cambios.',
     'La API devuelve sinCambios true y conserva versión 2. El balance permanece en $ 0,50. La operación mantiene una respuesta durable consultable.', 'Aprobado'),
    ('Eliminar con versión y confirmación', 'RN5 / CU25 FP A1 y E',
     'Pago propio vigente; solicitud con versión incorrecta y repetición de la misma clave tras una baja válida.',
     'Cancelar el diálogo en web; abrirlo de nuevo y confirmar. Por API, probar versión obsoleta y repetir la misma intención de eliminación.',
     'Cancelar no modifica. Una baja válida retira el efecto una sola vez; una versión obsoleta exige reconfirmar.',
     'Web conserva el pago al cancelar; confirmar la baja de $ 450 restituye deuda $ 1.200. API rechaza versión obsoleta con 409, conserva una baja lógica y repite su respuesta sin duplicar efectos. Detalle eliminado: 404.', 'Aprobado'),
    ('Retención desde el archivo', 'RNF-16 / Decisión P3',
     'Archivo hace menos de seis meses, exactamente seis meses y siete meses. Pagos vigentes y eliminados; falla de limpieza inyectada.',
     'Consultar historial, detalle e intención antes y después del vencimiento. Ejecutar limpieza, recalcular y repetir. Probar archivo el 31 de mayo.',
     'Conservar seis meses calendario; retirar historial y respuestas vencidas sin recrear deudas. Limpieza atómica y repetible.',
     'Antes del vencimiento el pago es visible; después, lista vacía y detalle/intención 410. La limpieza conserva el efecto acumulado, no el de pagos eliminados. Fallar revierte la limpieza. Un archivo el 31/05 vence el 30/11, no a 180 días.', 'Aprobado'),
    ('Protección de tablas financieras', 'RN1 / RNF-24',
     'Esquema local con migraciones 001, 004, 005, 006 y 007.',
     'Consultar catálogos de PostgreSQL y permisos de las tablas financieras después de aplicar 007.',
     'Tablas protegidas con RLS y sin privilegios de PUBLIC; acceso de clientes a través de la API.',
     'La integración confirma RLS y ausencia de grants a PUBLIC. Las migraciones 005–007 se aplicaron en Supabase el 22/11/2026, en una transacción: nueve tablas con RLS y sin acceso directo de anon/authenticated. Las pruebas funcionales usan datos ficticios locales.', 'Aprobado'),
    ('Interacción nativa Android', 'FP A1 E1 RN5 RN6 y RNF-23',
     'Android Emulator API 37, development build y Metro 8082. Ana cobra a Bruno; deuda inicial $ 1.200. API y datos ficticios locales.',
     'Abrir pago y cancelar. Rechazar $ 1.200,01 y corregir a $ 300. Editar a $ 450. Cancelar y confirmar eliminación. Registrar $ 500 con respuesta 503 perdida; verificar. Pagar los $ 700 restantes. Archivar y simular siete meses desde archivo.',
     'Mantener formularios utilizables con teclado, actualizar balances exactamente, evitar duplicados y respetar modo lectura y retención.',
     'Diez comprobaciones nativas aprobadas. Deuda $ 1.200 → $ 900 → $ 750 → $ 1.200 → $ 700 → sin deuda. Verificar recupera un pago ya confirmado, sin reenviarlo. SQL confirma dos pagos activos por $ 1.200 y uno eliminado. Archivo quita edición/eliminación; al vencer la retención, el historial deja de mostrarse.', 'Aprobado'),
    ('Interacción nativa iOS', 'FP A y E en iOS',
     'Entorno de ejecución Windows con emulador Android disponible; sin dispositivo ni simulador iOS conectado.',
     'Ejecutar en iOS los flujos de registro, cancelación, validación, edición, eliminación, recuperación y retención.',
     'Completar los mismos flujos con controles accesibles y formulario visible junto al teclado.',
     'No ejecutado en iOS. Android está verificado por separado en CP-CU26-17; sus resultados no se atribuyen a iOS.', 'Pendiente'),
]

doc = Document(REFERENCIA)
body = doc._element.body
bloques = list(body)
titulo_cu, resumen_p, resumen_t, titulo_caso, caso_t = [deepcopy(bloques[i]) for i in [4969,4970,4971,4973,4974]]
sect = deepcopy(body.sectPr)
for e in list(body):
    body.remove(e)
body.append(sect)

# Una evidencia autónoma no incorpora imágenes, comentarios ni contenido ajeno del anteproyecto.
for rid,rel in list(doc.part.rels.items()):
    if any(rel.reltype.endswith('/'+tipo) for tipo in ['image','hyperlink']):
        del doc.part.rels[rid]
for prop in ['title','subject','author','keywords','comments','last_modified_by']:
    setattr(doc.core_properties,prop,'')
doc.core_properties.title = 'Evidencia de testing de CU26'
doc.core_properties.author = 'Codex'
doc.core_properties.last_modified_by = 'Codex'

def limpiar_ids(e):
    for tag in ['bookmarkStart','bookmarkEnd','commentRangeStart','commentRangeEnd','commentReference']:
        for nodo in list(e.iter(qn('w:'+tag))):
            nodo.getparent().remove(nodo)
    for nodo in e.iter():
        for atributo in list(nodo.attrib):
            if atributo.endswith('}paraId') or atributo.endswith('}textId'):
                del nodo.attrib[atributo]

def texto_en_parrafo(p,texto):
    props = deepcopy(p.find(qn('w:pPr')))
    run = p.find(qn('w:r'))
    rprops = deepcopy(run.find(qn('w:rPr'))) if run is not None else None
    for nodo in list(p): p.remove(nodo)
    if props is not None: p.append(props)
    r=OxmlElement('w:r')
    if rprops is not None:r.append(rprops)
    t=OxmlElement('w:t');t.text=texto;r.append(t);p.append(r)
    limpiar_ids(p)
    return p

def agregar_clon(p,texto):
    nuevo=texto_en_parrafo(deepcopy(p),texto)
    props=nuevo.find(qn('w:pPr'))
    if props is None:props=OxmlElement('w:pPr');nuevo.insert(0,props)
    props.append(OxmlElement('w:keepNext'))
    body.insert(len(body)-1,nuevo)
    return nuevo

def parrafo(texto):
    p=doc.add_paragraph(texto)
    p.paragraph_format.space_after=Pt(8)
    p.paragraph_format.keep_together=True
    return p

def celda(tc,texto):
    p=tc.find(qn('w:p'))
    nuevo=texto_en_parrafo(deepcopy(p),texto)
    for e in list(tc):
        if e.tag!=qn('w:tcPr'):tc.remove(e)
    tc.append(nuevo)
    return tc

def no_cortar_filas(tabla):
    for row in tabla.findall(qn('w:tr')):
        trpr=row.find(qn('w:trPr'))
        if trpr is None: trpr=OxmlElement('w:trPr');row.insert(0,trpr)
        trpr.append(OxmlElement('w:cantSplit'))

title_style=doc.styles['Title']
title_style.font.name='Times New Roman';title_style.font.size=Pt(14)
title_style.font.bold=True;title_style.font.color.rgb=RGBColor(0,0,0)
fonts=title_style.element.rPr.find(qn('w:rFonts'))
for attr in list(fonts.attrib):
    if attr.endswith('Theme'):del fonts.attrib[attr]
for attr in ['ascii','hAnsi','eastAsia','cs']:fonts.set(qn('w:'+attr),'Times New Roman')
title_style.paragraph_format.space_after=Pt(10)
for pborder in list(title_style.element.iter(qn('w:pBdr'))):pborder.getparent().remove(pborder)
doc.add_paragraph('Testing CU26',style='Title')
parrafo('Registro de pagos entre participantes y operaciones de pagos de CU24 y CU25. '
         'Ejecución del 22/11/2026. Responsable de ejecución: Codex.')
parrafo('Se aprobaron 17 escenarios, incluyendo la interacción nativa Android. '
         'La interacción iOS permanece pendiente y se identifica en la última ficha. '
         'Se utilizaron datos ficticios y bases locales de pruebas; no se realizaron pagos reales ni escrituras de prueba en Supabase.')
agregar_clon(resumen_p,'Resumen de ejecución')
tabla=deepcopy(resumen_t)
filas=tabla.findall(qn('w:tr'));modelo_fila=deepcopy(filas[1])
for row in filas[1:]:tabla.remove(row)
for i,c in enumerate(CASOS,1):
    row=deepcopy(modelo_fila)
    for tc,texto in zip(row.findall(qn('w:tc')),[f'CP-CU26-{i:02}',c[0],c[1],c[-1]]):celda(tc,texto)
    tabla.append(row)
cab=tabla.find(qn('w:tr'));pr=cab.find(qn('w:trPr'));pr.append(OxmlElement('w:tblHeader'))
no_cortar_filas(tabla);body.insert(len(body)-1,tabla)
parrafo('')
agregar_clon(resumen_p,'Testing JEST y verificación de clientes')
parrafo(f"API: {resultados['numPassedTests']} pruebas aprobadas en {resultados['numPassedTestSuites']} suites. "
         'Servicio de pagos: 98,96 % de cobertura de líneas. La suite incluye HTTP, PostgreSQL y Redis reales, '
         'y la regresión de notificaciones con MongoDB local. Web: 88 pruebas aprobadas, build y lint correctos. '
         'Mobile: 82 pruebas aprobadas, tipos y lint correctos, bundle Android generado y diez comprobaciones visuales nativas Android aprobadas.')
parrafo('Comando API: npm run test:cobertura -- --runInBand. Resultados trazables en '
         'docs/testing/cu26-jest-resultados.json; casos de integración en api/test/pagos.integracion.test.ts '
         'y pruebas de importes en api/test/pago.entidad.test.ts. Los clientes incluyen test/pagos.test.mjs.')

for i,(titulo,flujo,datos,pasos,esperado,obtenido,estado) in enumerate(CASOS,1):
    ident=f'CP-CU26-{i:02}'
    agregar_clon(titulo_caso,f'{ident} – {titulo}')
    tabla=deepcopy(caso_t);limpiar_ids(tabla)
    pre='Sesión local válida, actividad iniciada y participantes Ana y Bruno, salvo la variante de estado o permiso indicada. Esquema de prueba aislado.'
    if i==17:pre='Emulador Android API 37 con development build y sesión ficticia de Ana. API temporal local con esquema aislado.'
    if i==18:pre='Entorno Windows. No hay dispositivo ni simulador iOS disponible.'
    valores=[ident,f'CU26 / {flujo}',pre,datos,pasos,esperado,obtenido,estado,'22/11/2026']
    filas=tabla.findall(qn('w:tr'))
    assert len(filas)==len(valores)
    etiquetas=['ID','Caso de uso / flujo','Precondiciones','Datos de entrada','Pasos','Resultado esperado','Resultado obtenido','Estado','Fecha']
    for fila,etiqueta,valor in zip(filas,etiquetas,valores):
        celdas=fila.findall(qn('w:tc'))
        celda(celdas[0],etiqueta)
        celda(celdas[1],valor)
    # Cada ficha cabe en una página; se conserva completa para evitar rótulos o cierres aislados.
    for j,fila in enumerate(filas):
        mantener=j<8
        for p in fila.iter(qn('w:p')):
            pr=p.find(qn('w:pPr'))
            if pr is None:pr=OxmlElement('w:pPr');p.insert(0,pr)
            for previo in list(pr.findall(qn('w:keepNext'))):pr.remove(previo)
            keep=OxmlElement('w:keepNext');keep.set(qn('w:val'),'1' if mantener else '0');pr.append(keep)
    no_cortar_filas(tabla);body.insert(len(body)-1,tabla)
    parrafo('')

for titulo,imagen,leyenda in [
    ('Web Confirmación pendiente','confirmacion-perdida-web.jpg','CP-CU26-10. La API confirmó el pago; el fixture reemplazó la respuesta por 503. Se conserva el monto y se ofrece Verificar resultado.'),
    ('Web Pago verificado','pago-verificado-web.jpg','CP-CU26-10. Verificar resultado recupera un solo pago de $ 500 y actualiza la deuda a $ 700.'),
    ('Android Validación y teclado','pago-invalido-android.png','CP-CU26-17. El monto superior a la deuda se rechaza con el máximo permitido. Campo y confirmación permanecen visibles con el teclado abierto.'),
    ('Android Confirmación pendiente','pago-respuesta-perdida-android.png','CP-CU26-17. El pago de $ 500 ya se confirmó en la API; mobile conserva el importe y permite verificar el resultado sin duplicarlo.'),
    ('Android Pago total confirmado','pago-total-android.png','CP-CU26-17. Los pagos de $ 500 y $ 700 saldan la deuda inicial de $ 1.200. La consulta SQL confirma dos pagos activos y ningún balance pendiente.'),
    ('Android Historial vencido','pagos-retencion-vencida-android.png','CP-CU26-17. Al simular siete meses desde el archivo de la actividad de prueba, el historial se oculta y el balance permanece consistente.'),
]:
    doc.add_page_break()
    agregar_clon(titulo_caso,titulo)
    p=doc.add_paragraph();p.alignment=1
    p.add_run().add_picture(str(BASE/imagen),width=Inches(3.3))
    p=parrafo(leyenda);p.alignment=1
    for r in p.runs:r.italic=True;r.font.size=Pt(10)

# Mantener el sistema de páginas de la fuente, con numeración propia desde 1.
if sect.find(qn('w:pgNumType')) is not None:sect.remove(sect.find(qn('w:pgNumType')))
pg=OxmlElement('w:pgNumType');pg.set(qn('w:start'),'1');sect.append(pg)
settings=doc.settings.element
update=settings.find(qn('w:updateFields'))
if update is None:update=OxmlElement('w:updateFields');settings.append(update)
update.set(qn('w:val'),'true')
doc.save(SALIDA)
assert sha256(REFERENCIA.read_bytes()).hexdigest()==HASH
print(json.dumps({'archivo':str(SALIDA),'casos':len(CASOS),'bytes':SALIDA.stat().st_size},ensure_ascii=False))
