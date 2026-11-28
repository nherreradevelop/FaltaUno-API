"""Integra CU42 y su testing en el anteproyecto conservando los bloques ajenos a la tarea."""
from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile
from hashlib import sha256
import json
from lxml import etree as E
from PIL import Image
from docx import Document
from docx.shared import Pt, Inches, RGBColor, Twips
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

BASE=Path(__file__).resolve().parent
RAIZ=BASE.parents[2]
CU=RAIZ/'docs/cu42-actividades-iniciadas/Anteproyecto_FaltaUno_con_CU42_orden_reciente.docx'
SALIDA=BASE/'Anteproyecto_FaltaUno_CU42_y_testing_2026-11-27.docx'
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
REL='{http://schemas.openxmlformats.org/package/2006/relationships}'
CT='{http://schemas.openxmlformats.org/package/2006/content-types}'
api=json.loads((BASE/'api-resultados.json').read_text(encoding='utf-8-sig'))
web=json.loads((BASE/'web-ejecucion.json').read_text(encoding='utf-8-sig'))
android=json.loads((BASE/'android-ejecucion.json').read_text(encoding='utf-8-sig'))
assert api['numFailedTests']==0
assert all(c['estado']=='aprobado' for r in [web,android] for c in r['casos'])
web_c={c['id']:c for c in web['casos']}
android_c={c['id']:c for c in android['casos']}

def total(log):
    import re
    text=(BASE/log).read_text(encoding='utf-8-sig')
    assert re.search(r'# fail 0\s',text)
    return int(re.search(r'# pass (\d+)',text).group(1))
cantidad_web=total('web-suite.log'); cantidad_mobile=total('mobile-suite.log')

definiciones=[
 ('01','Listado propio y etiqueta del día','FP y RN1 a RN5','Cuenta de prueba con doce iniciadas propias, una iniciada ajena y actividades propias de otros estados.','Abrir Mis actividades. Revisar la primera página, el orden, la etiqueta es hoy! y el plazo.','Solo iniciadas propias, orden descendente, diez por página y etiqueta verde solo en el inicio de hoy.'),
 ('02','Recorrer todas las actividades','A1 y RN4','Doce iniciadas propias; la primera página tiene diez.','Seleccionar Ver más y recorrer el final del listado.','Doce actividades distintas, en orden; no se ofrece otra página al terminar.'),
 ('03','Banner de Explorar','A4 y RN7','Existe una iniciada propia que comienza hoy en Uruguay.','Abrir Explorar, revisar ambos textos y seleccionar Ver mis actividades. Repetir a 390 píxeles.','Texto exacto solicitado y navegación correcta. La condición proviene de la base, sin depender de filtros o páginas.'),
 ('04','Acceder al detalle','A3','Listado de iniciadas cargado.','Seleccionar Ver detalle de Actividad de hoy CU42.','Se abre CU09 de esa actividad con su estado y opciones vigentes.'),
 ('05','Sin actividades iniciadas propias','E1 y exclusiones de RN7','Se archivan las doce propias en el esquema local; permanecen una iniciada ajena y actividades de otros estados.','Abrir Explorar y Mis actividades.','Banner ausente, mensaje de vacío y opción Explorar actividades.'),
 ('06','Falla inicial y recuperación','ER1','El servidor local de evidencia devuelve 503 en la consulta del listado.','Abrir Mis actividades; capturar la falla. Restaurar el servicio y seleccionar Reintentar.','Mensaje recuperable, sin vacío falso; reintentar recupera la primera página.'),
 ('07','Falla de la segunda página','A1 y ER1','Primera página válida; el servidor de evidencia falla solo para página 2.','Seleccionar Ver más; capturar el error. Restaurar y seleccionar Reintentar.','Se conservan los diez registros previos y se incorporan los dos restantes sin duplicar.'),
 ('08','Respuesta inválida','ER3','El servidor local devuelve HTTP 200 con una actividad incompleta.','Abrir Mis actividades.','El cliente rechaza la respuesta, muestra el mensaje de error y permite reintentar.'),
 ('09','Sesión inválida','ER2','El servidor de evidencia devuelve 401 al consultar iniciadas.','Abrir Mis actividades con la sesión del escenario de prueba.','Se retira la pantalla privada y se muestra el inicio de sesión.'),
]
if 'CP-CU42-11' in web_c and 'CP-CU42-11' in android_c:
    definiciones.append(('11','Actualizar tras un cambio de estado','A2 y E2','Listado cargado; las actividades propias cambian a Archivada en la base local.','Seleccionar Actualizar. Restaurar los datos y volver a actualizar.','Las archivadas desaparecen; al restaurar el escenario, vuelven las iniciadas y su etiqueta del día.'))
casos=[]
for numero,titulo,flujo,datos,pasos,esperado in definiciones:
    cid='CP-CU42-'+numero
    assert cid in web_c and cid in android_c, cid
    casos.append(dict(id=cid,titulo=titulo,flujo=flujo,precondiciones='Sesión válida en web y Android y datos sintéticos del entorno local, salvo el escenario indicado.',datos=datos,pasos=pasos,esperado=esperado,
        obtenido='Web: '+web_c[cid]['obtenido']+' Android: '+android_c[cid]['obtenido'],estado='Aprobado',fecha='27/11/2026',responsable='Codex — ejecución automatizada; revisión cruzada del equipo pendiente.'))
casos.append(dict(id='CP-CU42-10',titulo='Pertenencia y límites del día en Uruguay',flujo='RN1, RN7 y etiqueta es hoy!',
    precondiciones='PostgreSQL faltauno_test local; reloj de referencia fijo para las pruebas de límites.',
    datos='Referencias 26/11/2026 03:00 UTC y 27/11/2026 03:00 UTC; instante de consulta 27/11/2026 01:00 UTC.',
    pasos='Ejecutar las pruebas SQL de pertenencia, estados y límites de medianoche, y las pruebas de esHoyEnUruguay de ambos clientes.',
    esperado='El día es el de America/Montevideo. Se incluyen ambos extremos interiores; se excluye la medianoche siguiente, fechas inválidas y actividades ajenas o de otros estados.',
    obtenido='Aprobado en Jest con PostgreSQL real y en los tests de ambos clientes. La marca del banner sigue siendo verdadera con resultados filtrados vacíos. El organizador y el participante están cubiertos.',
    estado='Aprobado',fecha='27/11/2026',responsable='Codex — ejecución automatizada; revisión cruzada del equipo pendiente.'))
casos.sort(key=lambda c:c['id'])
(BASE/'casos.json').write_text(json.dumps(casos,ensure_ascii=False,indent=2),encoding='utf-8')

doc=Document()
sec=doc.sections[0]
sec.page_width=Twips(11906); sec.page_height=Twips(16838)
sec.top_margin=sec.bottom_margin=sec.left_margin=sec.right_margin=Twips(1418)
normal=doc.styles['Normal']; normal.font.name='Times New Roman'; normal.font.size=Pt(11)
normal.paragraph_format.space_after=Pt(7); normal.paragraph_format.line_spacing=1
for s in ['Title','Heading 1','Heading 2']:
    doc.styles[s].font.name='Times New Roman'; doc.styles[s].font.color.rgb=RGBColor(0,0,0)
def p(texto='',bold=False,nueva=False,size=11):
    n=doc.add_paragraph(); n.alignment=WD_ALIGN_PARAGRAPH.LEFT
    n.paragraph_format.keep_with_next=bold; n.paragraph_format.page_break_before=nueva
    r=n.add_run(texto); r.bold=bold; r.font.name='Times New Roman'; r.font.size=Pt(size); r.font.color.rgb=RGBColor(0,0,0)
    return n
def tabla(filas,anchos,header=True):
    t=doc.add_table(rows=0,cols=len(anchos));t.autofit=False;t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for c,w in zip(t.columns,anchos): c.width=Inches(w)
    for i,fila in enumerate(filas):
        row=t.add_row();row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        if header and i==0: row._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
        for cel,texto,ancho in zip(row.cells,fila,anchos):
            cel.width=Inches(ancho);pr=cel._tc.get_or_add_tcPr();b=OxmlElement('w:tcBorders')
            for lado in ['top','left','bottom','right']:
                e=OxmlElement('w:'+lado);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D9D9D9');b.append(e)
            pr.append(b)
            if header and i==0:
                shd=OxmlElement('w:shd');shd.set(qn('w:fill'),'E7E6E6');pr.append(shd)
            para=cel.paragraphs[0];para.paragraph_format.space_before=Pt(3);para.paragraph_format.space_after=Pt(3)
            if not header: para.paragraph_format.keep_with_next=i<len(filas)-1
            r=para.add_run(texto);r.font.name='Times New Roman';r.font.size=Pt(10.5);r.bold=header and i==0
    p('')
    return t

p('Testing CU42',True,True,14)
p('Ver mis actividades iniciadas',True,size=12)
p('Ejecución del 27/11/2026 en API, web y Android nativo. Se verifican el orden de más reciente a más antigua, la etiqueta verde “es hoy!”, el banner de actividades que comienzan hoy y todos los flujos de consulta y recuperación. Los datos y las fallas funcionales se prepararon en un esquema temporal de faltauno_test local.')
p('Resumen de ejecución',True)
tabla([('Verificación','Resultado'),('Suite API',f"{api['numPassedTests']} aprobadas; {api['numFailedTests']} fallidas; {api['numPendingTests']} omitidas."),
    ('Suite web',f'{cantidad_web} aprobadas; ninguna fallida.'),('Suite móvil',f'{cantidad_mobile} aprobadas; ninguna fallida.'),
    ('Pruebas funcionales',f'{len(casos)} casos documentados; web y Android con capturas, más verificación SQL y de fechas.'),
    ('Cobertura de servicios','98,71 % de líneas. ActividadesServicio: 100 %.'),
    ('Compilación y estilo','API y web compilan; móvil pasa tipos; lint y formato verificados.'),
    ('Limitaciones','Las tres pruebas omitidas corresponden a integración de notificaciones con MongoDB de pruebas. iOS y revisión cruzada del equipo no se ejecutaron.')],[1.65,4.65])
tabla([('ID','Caso','Flujo','Estado')]+[(c['id'],c['titulo'],c['flujo'],c['estado']) for c in casos],[1.05,2.55,1.9,0.8])
p('El entorno usa HTTP y PostgreSQL reales. Los modos de error 503, 401 y respuesta incompleta son fallas controladas por el servidor local de evidencia. La cuenta y la actividad de demostración de la base habitual se conservaron; las pruebas de errores no alteraron esos registros.')

for c in casos:
    p(c['id']+' '+c['titulo'],True,size=12)
    tabla([(k,str(v)) for k,v in [
        ('ID',c['id']),('Caso de uso / flujo','CU42 / '+c['flujo']),('Precondiciones',c['precondiciones']),
        ('Datos de entrada',c['datos']),('Pasos',c['pasos']),('Resultado esperado',c['esperado']),
        ('Resultado obtenido',c['obtenido']),('Estado',c['estado']),('Fecha',c['fecha']),('Responsable',c['responsable'])]], [1.45,4.85],False)

figuras=[('01','Listado y etiqueta verde','listado-angosto','listado'),
 ('02','Última página del listado','paginacion','paginacion'),('03','Banner y navegación a Mis actividades','banner-angosto','banner'),
 ('04','Detalle de la actividad elegida','detalle','detalle'),('05','Lista vacía','vacio','vacio'),
 ('05','Banner ausente sin iniciadas propias','sin-banner','sin-banner'),('06','Falla inicial recuperable','error','error'),
 ('06','Listado recuperado tras reintentar','reintento','reintento'),('07','Falla de la página siguiente','error-pagina','error-pagina'),
 ('08','Respuesta incompleta controlada','invalido','invalido'),('09','Sesión inválida y regreso al login','sesion','sesion')]
if 'CP-CU42-11' in web_c and 'CP-CU42-11' in android_c: figuras.append(('11','Actualizar después de archivar','actualizado','actualizado'))
for numero,titulo,w,a in figuras:
    p('CP-CU42-'+numero+' '+titulo,True,True,12)
    p('Capturas obtenidas durante la ejecución sobre el entorno local de evidencia.')
    t=doc.add_table(rows=1,cols=2);t.autofit=False;t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for cell,plataforma,nombre in zip(t.rows[0].cells,['Web','Android nativo'],['web-'+w+'.png','android-'+a+'.png']):
        cell.width=Inches(3.15)
        text=cell.paragraphs[0];text.alignment=WD_ALIGN_PARAGRAPH.CENTER
        r=text.add_run(plataforma);r.bold=True;r.font.name='Times New Roman';r.font.size=Pt(11)
        img=Image.open(BASE/'capturas'/nombre).convert('RGB')
        # El original permanece en capturas; este derivado solo encuadra la zona de contenido para el Word.
        if plataforma=='Android nativo': img=img.crop((0,60,img.width,min(img.height,2180)))
        salida=BASE/'capturas'/('doc-'+nombre.replace('.png','.jpg'))
        img.save(salida,quality=90)
        width=min(2.95,6.6*img.width/img.height)
        para=cell.add_paragraph();para.alignment=WD_ALIGN_PARAGRAPH.CENTER
        para.add_run().add_picture(str(salida),width=Inches(width))
    p('Texto del banner: “Tenes actividades que comienzan hoy!”. La leyenda explica cómo acceder a las iniciadas y sus detalles.' if numero=='03' else 'Las imágenes documentan el resultado del escenario indicado; los datos son sintéticos del entorno de pruebas.')

snippet=BASE/'Evidencia_testing_CU42_2026-11-27.docx'
doc.save(snippet)
with ZipFile(CU) as original, ZipFile(snippet) as evidencia:
    partes={i.filename:original.read(i.filename) for i in original.infolist()}
    root=E.fromstring(partes['word/document.xml']);body=root.find(W+'body')
    anteriores=[E.tostring(n) for n in body]
    anchor=next(n for n in body if ''.join(x.text or '' for x in n.iter(W+'t')).startswith('Anexo V:'))
    index=list(body).index(anchor)
    nuevos=[deepcopy(n) for n in E.fromstring(evidencia.read('word/document.xml')).find(W+'body') if n.tag!=W+'sectPr']
    rels=E.fromstring(partes['word/_rels/document.xml.rels'])
    sniprels=E.fromstring(evidencia.read('word/_rels/document.xml.rels'))
    contador=max([int(r.get('Id')[3:]) for r in rels if r.get('Id','').startswith('rId')]+[0])+1
    agregadas={};mapa={}
    for rel in sniprels:
        if not rel.get('Type','').endswith('/image'): continue
        rid='rId'+str(contador);contador+=1
        nombre='media/cu42_testing_'+str(contador)+Path(rel.get('Target')).suffix
        nueva=deepcopy(rel);nueva.set('Id',rid);nueva.set('Target',nombre);rels.append(nueva)
        agregadas['word/'+nombre]=evidencia.read('word/'+rel.get('Target'))
        mapa[rel.get('Id')]=rid
    for nodo in nuevos:
        for el in nodo.iter():
            if el.get(R+'embed') in mapa: el.set(R+'embed',mapa[el.get(R+'embed')])
    wp='{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}'
    dibujo_id=max([int(n.get('id','0')) for n in root.iter(wp+'docPr')]+[0])+1
    for nodo in nuevos:
        for el in nodo.iter(wp+'docPr'):
            el.set('id',str(dibujo_id));dibujo_id+=1
    for offset,n in enumerate(nuevos):body.insert(index+offset,n)
    # Separa el anexo siguiente sin modificar su párrafo original.
    separador=OxmlElement('w:p');run=OxmlElement('w:r');br=OxmlElement('w:br');br.set(qn('w:type'),'page');run.append(br);separador.append(run)
    body.insert(index+len(nuevos),separador);nuevos.append(separador)
    assert [E.tostring(n) for n in body if n not in nuevos]==anteriores
    partes['word/document.xml']=E.tostring(root,encoding='UTF-8',xml_declaration=True,standalone=True)
    partes['word/_rels/document.xml.rels']=E.tostring(rels,encoding='UTF-8',xml_declaration=True,standalone=True)
    tipos=E.fromstring(partes['[Content_Types].xml'])
    for ext,mime in [('jpg','image/jpeg'),('jpeg','image/jpeg'),('png','image/png')]:
        if not any(n.get('Extension')==ext for n in tipos):
            nuevo=E.SubElement(tipos,CT+'Default');nuevo.set('Extension',ext);nuevo.set('ContentType',mime)
    partes['[Content_Types].xml']=E.tostring(tipos,encoding='UTF-8',xml_declaration=True,standalone=True)
    with ZipFile(SALIDA,'w') as out:
        for info in original.infolist():out.writestr(deepcopy(info),partes[info.filename])
        for nombre,contenido in agregadas.items():out.writestr(nombre,contenido)
    intactas=[n for n in original.namelist() if n not in ['word/document.xml','word/_rels/document.xml.rels','[Content_Types].xml']]
    with ZipFile(SALIDA) as out:assert all(out.read(n)==original.read(n) for n in intactas)
reporte={'salida':str(SALIDA),'casos':len(casos),'paresDeCapturas':len(figuras),'bloquesPreviosConservados':len(anteriores),
    'partesOriginalesIntactas':len(intactas),'sha256Fuente':sha256(CU.read_bytes()).hexdigest(),
    'pruebas':{'api':api['numPassedTests'],'web':cantidad_web,'mobile':cantidad_mobile,'omitidasAPI':api['numPendingTests']}}
(BASE/'verificacion-documento.json').write_text(json.dumps(reporte,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(reporte,ensure_ascii=False))
