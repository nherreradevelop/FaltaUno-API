"""Evidencia integral CU23–26; conserva las fichas del Anexo IV de la referencia."""
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import json
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from PIL import Image
from reordenar_evidencia import reordenar

BASE = Path(__file__).resolve().parent
REFERENCIA = Path('D:/Descargas/20260826-ATI-319004-341831-247305 (7).docx')
HASH = 'de7711094c3725096ad3296e1711e4f0c29f8de7bdb2db6731c0d8f36a72aa07'
SALIDA = BASE / 'Evidencia_testing_CU23_CU26_2026-11-23.docx'
assert sha256(REFERENCIA.read_bytes()).hexdigest() == HASH
casos = json.loads((BASE / 'casos.json').read_text(encoding='utf-8'))
resultados = json.loads((BASE / 'api-resultados.json').read_text(encoding='utf-8'))
manifiesto = json.loads((BASE / 'manifiesto.json').read_text(encoding='utf-8'))
assert resultados['numPassedTests'] == 331 and resultados['numFailedTests'] == 0
assert all(t['estado'] == 'passed' for s in manifiesto['suites'] for t in s['casos'])

doc = Document(REFERENCIA)
body = doc._element.body
bloques = list(body)
resumen_p, resumen_t, titulo_caso, caso_t = [deepcopy(bloques[i]) for i in [4970,4971,4973,4974]]
sect = deepcopy(body.sectPr)
for e in list(body): body.remove(e)
body.append(sect)
# El contenido del anteproyecto se reemplaza; estilos, numeración y partes estructurales se conservan.
for rid, rel in list(doc.part.rels.items()):
    if any(rel.reltype.endswith('/'+tipo) for tipo in ['image','hyperlink']):
        del doc.part.rels[rid]
for prop in ['title','subject','author','keywords','comments','last_modified_by']:
    setattr(doc.core_properties, prop, '')
doc.core_properties.title = 'Testing integral CU23 a CU26'
doc.core_properties.author = 'Codex'

def limpiar_ids(e):
    for tag in ['bookmarkStart','bookmarkEnd','commentRangeStart','commentRangeEnd','commentReference']:
        for nodo in list(e.iter(qn('w:'+tag))): nodo.getparent().remove(nodo)
    for nodo in e.iter():
        for atributo in list(nodo.attrib):
            if atributo.endswith('}paraId') or atributo.endswith('}textId'): del nodo.attrib[atributo]

def texto_en_parrafo(p, texto):
    props = deepcopy(p.find(qn('w:pPr')))
    run = p.find(qn('w:r'))
    rprops = deepcopy(run.find(qn('w:rPr'))) if run is not None else None
    for nodo in list(p): p.remove(nodo)
    if props is not None: p.append(props)
    r = OxmlElement('w:r')
    if rprops is not None: r.append(rprops)
    t = OxmlElement('w:t'); t.text = texto; r.append(t); p.append(r)
    limpiar_ids(p)
    return p

def agregar_clon(modelo, texto):
    p = texto_en_parrafo(deepcopy(modelo), texto)
    pr = p.find(qn('w:pPr'))
    if pr is None: pr=OxmlElement('w:pPr'); p.insert(0,pr)
    pr.append(OxmlElement('w:keepNext'))
    body.insert(len(body)-1,p)
    return p

def parrafo(texto):
    p = doc.add_paragraph(texto)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_together = True
    return p

def celda(tc, texto):
    p = texto_en_parrafo(deepcopy(tc.find(qn('w:p'))), texto)
    for e in list(tc):
        if e.tag != qn('w:tcPr'): tc.remove(e)
    tc.append(p)

def no_cortar_filas(tabla):
    for row in tabla.findall(qn('w:tr')):
        pr = row.find(qn('w:trPr'))
        if pr is None: pr=OxmlElement('w:trPr'); row.insert(0,pr)
        pr.append(OxmlElement('w:cantSplit'))

title = doc.styles['Title']
title.font.name='Times New Roman'; title.font.size=Pt(14); title.font.bold=True
title.font.color.rgb=RGBColor(0,0,0)
fonts = title.element.rPr.find(qn('w:rFonts'))
for atributo in list(fonts.attrib):
    if atributo.endswith('Theme'): del fonts.attrib[atributo]
for atributo in ['ascii','hAnsi','eastAsia','cs']: fonts.set(qn('w:'+atributo),'Times New Roman')
for border in list(title.element.iter(qn('w:pBdr'))): border.getparent().remove(border)
title.paragraph_format.space_after = Pt(10)

doc.add_paragraph('Testing integral CU23, CU24, CU25 y CU26',style='Title')
parrafo('Registro, edición y eliminación de gastos; registro y mantenimiento de pagos. Reejecución del 23/11/2026. Responsable: Codex.')
parrafo('Se ejecutaron las suites completas y los flujos visuales en web y Android nativo. Esta evidencia usa los campos y componentes del Anexo IV desde la página 325 del documento aportado. El original no se modificó.')
parrafo('Resultado: 331 pruebas API en 27 suites, 94 pruebas web y 88 pruebas mobile aprobadas; cero fallidas. Cobertura de líneas de servicios API: 98,45 %; pagos: 99 %. Se documentan 26 fichas aprobadas y una pendiente de ejecución nativa iOS.')
parrafo('Las cifras de las suites incluyen la regresión de otros módulos. El inventario contiene 108 pruebas API relacionadas con gastos, pagos, auditoría, entrega de notificaciones y actualización financiera, con sus nombres y estados reales. Los casos negativos y de concurrencia se verificaron con HTTP, PostgreSQL, Redis y MongoDB locales, según corresponda.')
parrafo('No todos los controles internos de seguridad o rollback tienen una pantalla: cada ficha identifica si su evidencia proviene de API, web o Android. No se atribuyen capturas ni ejecución nativa a iOS.')
agregar_clon(resumen_p,'Entorno y trazabilidad')
parrafo('Datos ficticios Ana, Bruno y Camila; PostgreSQL local faltauno_test, Redis /15 y MongoDB local. API temporal 3001, Vite 5175, Metro 8082 y Android Emulator API 37 con development build. No se realizaron pagos reales ni escrituras de prueba en Supabase. Se retiraron las sesiones, el esquema efímero y los procesos temporales al finalizar.')
parrafo('Durante la preparación, Metro informó un fallo inicial de arranque del development build. La app se relanzó antes de iniciar las pruebas; todos los flujos nativos documentados se completaron después. No se cambió código funcional durante esta reejecución.')
parrafo('Fuentes: api-resultados.json, web-suite.log, mobile-suite.log, manifiesto.json, web-estado-pagos.json y android-estado-sql.json, en la carpeta de esta entrega. El archivo ZIP conserva las 45 capturas originales, los resultados y el inventario de pruebas. Las páginas de capturas de este Word seleccionan los pasos principales de cada flujo.')

doc.add_page_break()
agregar_clon(resumen_p,'Resumen de casos de prueba')
tabla = deepcopy(resumen_t); limpiar_ids(tabla)
filas=tabla.findall(qn('w:tr')); modelo=deepcopy(filas[1])
for row in filas[1:]: tabla.remove(row)
for c in casos:
    row=deepcopy(modelo)
    for tc,valor in zip(row.findall(qn('w:tc')),[c['id'],c['titulo'],c['cu'],c['estado']]): celda(tc,valor)
    tabla.append(row)
cab=tabla.find(qn('w:tr')); pr=cab.find(qn('w:trPr'))
if pr is None: pr=OxmlElement('w:trPr'); cab.insert(0,pr)
pr.append(OxmlElement('w:tblHeader'))
no_cortar_filas(tabla); body.insert(len(body)-1,tabla)
parrafo('')

for c in casos:
    agregar_clon(titulo_caso,c['id']+' – '+c['titulo'])
    tabla=deepcopy(caso_t); limpiar_ids(tabla)
    pre='Sesión válida y actividad local aislada con Ana y Bruno, salvo la variante indicada. Modalidad: '+c['modalidad']+'.'
    if c['estado']=='Pendiente': pre='Windows sin dispositivo ni simulador iOS conectado.'
    valores=[c['id'],c['cu'],pre,c['datos'],c['pasos'],c['esperado'],c['obtenido'],c['estado'],c['fecha']]
    etiquetas=['ID','Caso de uso / flujo','Precondiciones','Datos de entrada','Pasos','Resultado esperado','Resultado obtenido','Estado','Fecha']
    filas=tabla.findall(qn('w:tr')); assert len(filas)==9
    for j,(row,etiqueta,valor) in enumerate(zip(filas,etiquetas,valores)):
        tc=row.findall(qn('w:tc')); celda(tc[0],etiqueta); celda(tc[1],valor)
        for p in row.iter(qn('w:p')):
            pr=p.find(qn('w:pPr'))
            if pr is None: pr=OxmlElement('w:pPr'); p.insert(0,pr)
            for old in list(pr.findall(qn('w:keepNext'))): pr.remove(old)
            keep=OxmlElement('w:keepNext'); keep.set(qn('w:val'),'1' if j<8 else '0'); pr.append(keep)
    no_cortar_filas(tabla); body.insert(len(body)-1,tabla); parrafo('')

FIGURAS = [
('Importe inválido y corrección','web-03-monto-invalido.jpg','android-06-pago-invalido-teclado.png','CP-CU26-03: el pago excede la deuda. Se informa el máximo y se conserva el borrador; en Android los controles siguen visibles con teclado.'),
('Pago parcial','web-04-pago-parcial.jpg','android-07-pago-parcial.png','CP-CU26-01: el registro de $300 deja deuda $900 y un pago en el historial.'),
('Edición de pago','web-05-pago-editado.jpg','android-08-pago-editado.png','CP-CU24-02: editar a $450 deja deuda $750. La edición utiliza el máximo excluyendo el efecto anterior.'),
('Confirmación de baja de pago','web-06-confirmacion-eliminar.jpg','android-09-confirmacion-eliminar.png','CP-CU25-02: el diálogo identifica partes e importe; cancelar conserva el pago y confirmar retira su efecto una sola vez.'),
('Confirmación perdida','web-08-respuesta-perdida.jpg','android-12-respuesta-perdida.png','CP-CU26-08: el fixture confirmó $500 y devolvió 503. Los clientes conservan la intención bloqueada y ofrecen Verificar resultado.'),
('Resultado recuperado','web-09-pago-verificado.jpg','android-13-pago-verificado.png','CP-CU26-08: Verificar recupera un único pago de $500; queda deuda $700, sin descontarla dos veces.'),
('Deuda saldada','web-17-deuda-saldada.jpg','android-14-pago-total.png','CP-CU26-01 y CP-CU26-04: los pagos de $500 y $700 saldan la deuda; no se ofrece otro pago. El último total se ejecutó en Android y se reflejó en web.'),
('Previsualización de reparto','web-11-reparto-centesimos.jpg','android-16-reparto-gasto.png','CP-CU23-01: web reparte $150,01 en tres partes exactas e identifica a la invitada pagadora. Android muestra su gasto de $200 asignado a Bruno.'),
('Gasto registrado','web-12-gasto-registrado.jpg','android-17-gasto-registrado.png','CP-CU23-01: registros realizados por cada interfaz, con la identidad de la persona pagadora y balances actualizados.'),
('Gasto editado','web-13-gasto-editado.jpg','android-18-gasto-editado.png','CP-CU24-01: web cambia pagador, reparto y monto a $180,02; Android edita $200 a $250. Los balances retiran el efecto anterior.'),
('Confirmación de baja de gasto','web-14-confirmacion-gasto.jpg','android-19-confirmacion-gasto.png','CP-CU25-01: las confirmaciones identifican concepto, importe y pagador. Cancelar conserva el gasto.'),
('Gasto eliminado','web-15-gasto-eliminado.jpg','android-21-gasto-eliminado.png','CP-CU25-01: cada baja devuelve el balance a su estado anterior: $1.200 en la secuencia web y sin deuda en la secuencia Android.'),
('Actividad archivada','web-19-actividad-archivada.jpg','android-22-actividad-archivada.png','CP-CU26-05 y CP-CU26-11: archivo reciente simulado en el esquema local. El historial se conserva en lectura y se informa su vencimiento.'),
('Detalle archivado','web-20-pago-archivado-solo-lectura.jpg','android-23-pago-archivado-solo-lectura.png','CP-CU26-05: el detalle sigue disponible; no se ofrecen edición ni eliminación.'),
('Retención vencida','web-21-retencion-vencida.jpg','android-24-retencion-vencida.png','CP-CU26-11: siete meses desde archivo simulados en el fixture. Desaparece el historial y el saldo continúa en cero. La purga y sus acumulados se verifican en las pruebas SQL.'),
]
for titulo,web,android,leyenda in FIGURAS:
    doc.add_page_break(); agregar_clon(titulo_caso,titulo)
    tabla=doc.add_table(rows=1,cols=2); tabla.alignment=WD_TABLE_ALIGNMENT.CENTER
    tabla.autofit=False
    for cel,archivo,ancho,etiqueta in zip(tabla.rows[0].cells,[web,android],[3.0,2.55],['Web','Android nativo']):
        cel.width=Inches(3.1); cel.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p=cel.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        r=p.add_run(etiqueta); r.bold=True; r.font.name='Times New Roman'; r.font.size=Pt(12)
        p=cel.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        imagen=p.add_run().add_picture(str(BASE/archivo),width=Inches(ancho))
        if etiqueta=='Web':
            # Encuadre de documento: amplía el panel o diálogo sin modificar la captura original.
            with Image.open(BASE/archivo) as original: w,h=original.size
            x,ancho_region=(420,410) if 'confirmacion' in archivo else (850,350)
            recorte=OxmlElement('a:srcRect')
            recorte.set('l',str(round(x/w*100000)))
            recorte.set('r',str(round((w-x-ancho_region)/w*100000)))
            imagen._inline.graphic.graphicData.pic.blipFill.insert(1,recorte)
            alto=Inches(ancho*h/ancho_region)
            imagen.height=alto
            imagen._inline.graphic.graphicData.pic.spPr.xfrm.ext.cy=alto
        pr=cel._tc.get_or_add_tcPr(); borders=OxmlElement('w:tcBorders')
        for edge in ['top','left','bottom','right']:
            e=OxmlElement('w:'+edge); e.set(qn('w:val'),'single'); e.set(qn('w:sz'),'4'); e.set(qn('w:color'),'D9D9D9'); borders.append(e)
        pr.append(borders)
    no_cortar_filas(tabla._tbl)
    p=parrafo(leyenda); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    for r in p.runs: r.italic=True; r.font.size=Pt(10)

if sect.find(qn('w:pgNumType')) is not None: sect.remove(sect.find(qn('w:pgNumType')))
pg=OxmlElement('w:pgNumType'); pg.set(qn('w:start'),'1'); sect.append(pg)
settings=doc.settings.element; update=settings.find(qn('w:updateFields'))
if update is None: update=OxmlElement('w:updateFields'); settings.append(update)
update.set(qn('w:val'),'true')
doc.save(SALIDA)
reordenar(SALIDA)
assert sha256(REFERENCIA.read_bytes()).hexdigest()==HASH
print(json.dumps({'archivo':str(SALIDA),'casos':len(casos),'figurasComparadas':len(FIGURAS),'bytes':SALIDA.stat().st_size},ensure_ascii=False))
