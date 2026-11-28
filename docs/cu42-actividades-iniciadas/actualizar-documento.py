"""Inserta CU42 en el Anexo I y conserva todas las partes originales restantes."""
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Twips, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from lxml import etree as E

BASE = Path(__file__).resolve().parent
FUENTE = Path(r'D:\Descargas\20260826-ATI-319004-341831-247305 (1).docx')
SALIDA = BASE / 'Anteproyecto_FaltaUno_con_CU42_orden_reciente.docx'
QA = BASE / 'qa'
QA.mkdir(exist_ok=True)
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Twips(11906), Twips(16838)
sec.top_margin = sec.bottom_margin = sec.left_margin = sec.right_margin = Twips(1418)
normal = doc.styles['Normal']
normal.font.name = 'Times New Roman'
normal.font.size = Pt(12)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1
for nombre in ['Title', 'Heading 1', 'Heading 2']:
    doc.styles[nombre].font.name = 'Times New Roman'
    doc.styles[nombre].font.color.rgb = RGBColor(0, 0, 0)

def par(texto, negrita=False, salto=False, titulo=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1
    p.paragraph_format.page_break_before = salto
    p.paragraph_format.keep_with_next = negrita or titulo
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(texto)
    r.font.name = 'Times New Roman'
    r.font.size = Pt(14 if titulo else 12)
    r.font.color.rgb = RGBColor(0, 0, 0)
    r.bold = negrita or titulo
    return p

def tabla(filas, anchos):
    t = doc.add_table(rows=0, cols=len(anchos))
    t.autofit = False
    for col, ancho in zip(t.columns, anchos): col.width = Twips(ancho)
    for indice, fila in enumerate(filas):
        row = t.add_row()
        pr = row._tr.get_or_add_trPr()
        pr.append(OxmlElement('w:cantSplit'))
        if indice == 0: pr.append(OxmlElement('w:tblHeader'))
        for celda, texto, ancho in zip(row.cells, fila, anchos):
            celda.width = Twips(ancho)
            tcpr = celda._tc.get_or_add_tcPr()
            bordes = OxmlElement('w:tcBorders')
            for lado in ['top', 'left', 'bottom', 'right']:
                borde = OxmlElement('w:' + lado)
                borde.set(qn('w:val'), 'single'); borde.set(qn('w:sz'), '4'); borde.set(qn('w:color'), 'D9D9D9')
                bordes.append(borde)
            tcpr.append(bordes)
            margenes = OxmlElement('w:tcMar')
            for lado in ['top', 'left', 'bottom', 'right']:
                margen = OxmlElement('w:' + lado); margen.set(qn('w:w'), '90'); margen.set(qn('w:type'), 'dxa'); margenes.append(margen)
            tcpr.append(margenes)
            if indice == 0:
                fondo = OxmlElement('w:shd'); fondo.set(qn('w:fill'), 'E7E6E6'); tcpr.append(fondo)
            p = celda.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(0); p.paragraph_format.line_spacing = 1
            r = p.add_run(texto); r.bold = indice == 0
            r.font.name = 'Times New Roman'; r.font.size = Pt(11); r.font.color.rgb = RGBColor(0, 0, 0)
    return t

par('CU42 Ver mis actividades iniciadas', salto=True, titulo=True)
par('1. Ficha del caso de uso', True)
tabla([
    ('Campo', 'Descripción'),
    ('ID', 'CU42'),
    ('Nombre', 'Ver mis actividades iniciadas'),
    ('Actor principal', 'Usuario autenticado en la aplicación web o móvil'),
    ('Actores secundarios', 'Sistema'),
    ('Objetivo', 'Mostrar todas las actividades en estado Iniciada a las que el usuario está unido, incluidas las que organiza, y permitir acceder a su detalle.'),
    ('Trigger (disparador)', 'El usuario selecciona “Mis actividades” en el encabezado web o en la barra de navegación móvil (CU39).'),
    ('Prioridad', 'A definir por el equipo.'),
    ('Precondiciones', 'El usuario tiene una sesión vigente (CU01). No es necesario que tenga actividades iniciadas.'),
    ('Postcondición de éxito', 'Se muestran las actividades iniciadas propias, o el estado vacío correspondiente. No se modifican actividades ni participaciones.'),
    ('Postcondición de fracaso', 'Se informa el error y se permite reintentar. Las páginas ya cargadas se conservan; una respuesta fallida no se presenta como una lista vacía.'),
    ('Requerimientos relacionados', 'RF-17. Se relaciona con CU11 (incorporación), CU14 (consulta general de actividades propias), CU09 (detalle), CU23 y CU26 (plazo de gastos y pagos), CU39 (navegación móvil) y CU41 (actualización de estados).'),
    ('Origen', 'Solicitud de una pantalla específica de actividades propias iniciadas, aprobada el 27/11/2026.'),
], [2450, 6620])

par('2. Flujo principal FP', True, salto=True)
tabla([
    ('Paso', 'Actor', 'Acción'),
    ('1', 'Usuario', 'Abre “Mis actividades”.'),
    ('2', 'Sistema', 'Muestra el título “Mis actividades”, la sección “Actividades iniciadas” y un indicador de carga con la forma de las tarjetas.'),
    ('3', 'Sistema', 'Valida la sesión y consulta las actividades cuya participación corresponde a ese usuario y cuyo estado persistido es Iniciada (RN1 y RN2).'),
    ('4', 'Sistema', 'Ordena por fecha y hora de inicio descendente, de la más reciente a la más antigua; desempata por identificador descendente y devuelve la primera página de hasta 10 actividades (RN3 y RN4).'),
    ('5', 'Sistema', 'Por actividad muestra nombre, deporte, departamento, estado “Iniciada”, inicio, plazo de gastos y pagos y “Organizada por vos” cuando corresponde. Si comienza hoy en Uruguay, agrega la etiqueta verde “es hoy!”. Ofrece “Ver detalle”.'),
    ('6', 'Sistema', 'Si quedan resultados, ofrece “Ver más”. Mantiene disponible la opción “Actualizar”.'),
], [650, 1100, 7320])
par('Postcondición del flujo principal: el usuario ve la primera página de sus actividades iniciadas y puede recorrer el resto sin modificar datos.')

par('3. Flujos alternativos A', True)
par('A1 Ver más actividades', True)
par('Se dispara después del paso 6 del flujo principal cuando quedan resultados. El usuario selecciona “Ver más”; el sistema indica la carga y deshabilita la acción mientras consulta la página siguiente. Al recibirla, agrega sus actividades sin repetir identificadores y actualiza la disponibilidad de “Ver más”. Si falla, aplica ER1 o ER3 y permite reintentar esa misma página.')
par('Postcondición: se conservan las actividades anteriores y se agregan las siguientes en el orden definido.')
par('A2 Actualizar el listado', True)
par('El usuario selecciona “Actualizar”. Además, en móvil el sistema actualiza al volver a la pestaña. Consulta desde la primera página y, cuando recibe una respuesta válida, reemplaza el listado anterior y reinicia la paginación. Las actividades que dejaron de estar Iniciadas o dejaron de pertenecer al usuario ya no se incluyen. Si falla, conserva lo que se había mostrado y ofrece reintentar.')
par('A3 Acceder al detalle de una actividad', True)
par('El usuario selecciona “Ver detalle”. El sistema abre CU09 con los datos y acciones correspondientes al estado y rol vigentes. Al volver al listado, el usuario puede actualizarlo mediante A2.')
par('A4 Acceder desde el aviso de Explorar', True)
par('Al consultar Explorar, la API comprueba si el usuario es miembro de una actividad Iniciada que comienza hoy en Uruguay. Envía la marca con los resultados, independientemente de filtros y paginación. Si es verdadera, muestra “Tenes actividades que comienzan hoy!” y “hace click aca para ver tus actividades iniciadas y entra a la actividad para ver los detalles.”. El botón “Ver mis actividades” abre este caso de uso. En otro caso, oculta el banner.')

par('4. Flujos de excepción E', True)
par('E1 El usuario no tiene actividades iniciadas', True)
par('Se dispara en el paso 3 si la consulta válida no encuentra resultados. El sistema muestra “Todavía no participás en ninguna actividad iniciada.” y ofrece “Explorar actividades”, que abre CU08. No muestra actividades programadas, archivadas o canceladas para completar el listado.')
par('E2 La actividad cambió de estado', True)
par('Si una actividad cambió de estado después de cargarla, su detalle se rige por CU09. La siguiente actualización del listado la excluye cuando ya no está Iniciada. Una página posterior vacía finaliza la paginación; no elimina las actividades ya cargadas.')

par('5. Flujos de error ER', True)
par('ER1 Falla al recuperar las actividades', True)
par('Ante una falla de conexión, del servicio o de la base de datos, el sistema registra el error técnico y muestra “No pudimos cargar tus actividades iniciadas. Probá de nuevo.” junto a “Reintentar”. Conserva las páginas cargadas y no avanza la paginación. Reintentar repite la consulta que falló.')
par('ER2 Sesión vencida o inválida', True)
par('El servidor rechaza la consulta sin sesión válida. El cliente descarta el acceso a las pantallas privadas y dirige a CU01 mediante el mecanismo de sesión existente. Nunca consulta actividades de otro usuario a partir de un identificador enviado por el cliente.')
par('ER3 Respuesta incompleta o inválida', True)
par('Si la respuesta no tiene los campos, estado, fechas o número de página esperados, el cliente no incorpora resultados. Informa el mismo mensaje de ER1 y permite reintentar, conservando las páginas previamente confirmadas.')

par('6. Reglas de negocio asociadas', True)
for texto in [
    'RN1: Solo se incluyen actividades vinculadas a una participación del usuario autenticado. El organizador también participa (CU11 RN6); se incluyen ambos roles.',
    'RN2: El estado debe ser Iniciada en la base de datos. No se deduce a partir de la fecha, no se cambia al consultar y no se filtra por cupos o por vencimiento del plazo de gastos.',
    'RN3: Las actividades se ordenan por fecha y hora de inicio descendente, de la más reciente a la más antigua. El identificador descendente resuelve empates.',
    'RN4: Todas las actividades que cumplen RN1 y RN2 son accesibles mediante páginas de 10. Cada actividad aparece una sola vez en la lista cargada.',
    'RN5: La fecha límite de gastos y pagos usa el mismo cálculo de dominio que CU09, CU23 y CU26. Mostrarla no habilita operaciones fuera de sus respectivos plazos.',
    'RN6: Esta consulta es de lectura. Las acciones sobre una actividad se resuelven desde CU09 y los casos de uso que correspondan. CU14 conserva el alcance de programadas, historial, canceladas e invitaciones.',
    'RN7: El banner de Explorar se muestra solo si existe una actividad propia en estado Iniciada que empieza hoy en America/Montevideo. Las actividades programadas, archivadas, canceladas, de otros días o sin participación del usuario no lo habilitan. La comprobación se hace en el servidor y se incluye en la consulta de Explorar.',
]: par(texto)

par('7. Requerimientos no funcionales relevantes', True)
tabla([
    ('ID', 'Requerimiento aplicado'),
    ('RNF-05', 'Información clara y ordenada, con las mismas etiquetas en web y móvil; fechas y horas en hora de Uruguay.'),
    ('RNF-09', 'Registro de fallas técnicas sin exponer datos sensibles.'),
    ('RNF-10', 'Reintento de la página fallida, sin resultados duplicados; acciones de carga deshabilitadas mientras se ejecutan.'),
    ('RNF-13', 'Validación de sesión en cada consulta y tratamiento del vencimiento mediante el flujo de sesión existente.'),
    ('RNF-24', 'El servidor determina la identidad desde la sesión y limita la consulta a sus participaciones.'),
], [1250, 7820])

# Construye con python-docx y trasplanta exclusivamente los nuevos bloques al paquete original.
doc.save(QA / 'CU42.docx')
with ZipFile(FUENTE) as original:
    root = E.fromstring(original.read('word/document.xml'))
    body = root.find(W + 'body')
    before = [E.tostring(n) for n in body]
    target = next(n for n in body if ''.join(t.text or '' for t in n.iter(W + 't')).startswith('Anexo II:'))
    index = list(body).index(target)
    with ZipFile(QA / 'CU42.docx') as snippet:
        snip = E.fromstring(snippet.read('word/document.xml')).find(W + 'body')
        added = [deepcopy(n) for n in snip if n.tag != W + 'sectPr']
    for offset, block in enumerate(added): body.insert(index + offset, block)
    # Nueva página para separar el CU del anexo siguiente, sin tocar el párrafo preexistente.
    separator = OxmlElement('w:p')
    run = OxmlElement('w:r'); br = OxmlElement('w:br'); br.set(qn('w:type'), 'page'); run.append(br); separator.append(run)
    body.insert(index + len(added), separator)
    added.append(separator)
    xml = E.tostring(root, encoding='UTF-8', xml_declaration=True, standalone=True)
    with ZipFile(SALIDA, 'w') as salida:
        for info in original.infolist():
            salida.writestr(deepcopy(info), xml if info.filename == 'word/document.xml' else original.read(info.filename))
    remaining = [E.tostring(n) for n in body if n not in added]
    assert remaining == before, 'Se modificó contenido ajeno a CU42'
    with ZipFile(SALIDA) as salida:
        assert all(salida.read(n) == original.read(n) for n in original.namelist() if n != 'word/document.xml')
    report = {'fuente': str(FUENTE), 'salida': str(SALIDA), 'sha256Fuente': sha256(FUENTE.read_bytes()).hexdigest(),
              'bloquesOriginalesConservados': len(before), 'bloquesAgregados': len(added), 'otrasPartesIntactas': True}
    (QA / 'verificacion-documento.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(str(SALIDA))
