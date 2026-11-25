"""Intercala las capturas existentes tras su ficha, conservando el resto del paquete DOCX."""
from collections import Counter
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
from lxml import etree

BASE = Path(__file__).resolve().parent
DOCUMENTO = BASE / 'Evidencia_testing_CU23_CU26_2026-11-23.docx'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CAPTURAS_POR_CASO = {
    'CP-CU23-01': ['Previsualización de reparto', 'Gasto registrado'],
    'CP-CU24-01': ['Gasto editado'],
    'CP-CU24-02': ['Edición de pago'],
    'CP-CU25-01': ['Confirmación de baja de gasto', 'Gasto eliminado'],
    'CP-CU25-02': ['Confirmación de baja de pago'],
    'CP-CU26-01': ['Pago parcial', 'Deuda saldada'],
    'CP-CU26-03': ['Importe inválido y corrección'],
    'CP-CU26-05': ['Actividad archivada', 'Detalle archivado'],
    'CP-CU26-08': ['Confirmación perdida', 'Resultado recuperado'],
    'CP-CU26-11': ['Retención vencida'],
}

def texto(nodo):
    return ''.join(nodo.itertext()) if nodo.tag == W+'t' else ''.join(t.text or '' for t in nodo.iter(W+'t'))

def salto_de_pagina(nodo):
    return nodo.tag == W+'p' and any(b.get(W+'type') == 'page' for b in nodo.iter(W+'br'))

def reordenar(ruta=DOCUMENTO):
    ruta = Path(ruta)
    casos = json.loads((BASE / 'casos.json').read_text(encoding='utf-8'))
    titulos_casos = {c['id']+' – '+c['titulo']: c['id'] for c in casos}
    titulos_capturas = {t for grupo in CAPTURAS_POR_CASO.values() for t in grupo}
    with ZipFile(ruta) as archivo:
        partes = [(info, archivo.read(info.filename)) for info in archivo.infolist()]
    originales = {info.filename: contenido for info, contenido in partes}
    raiz = etree.fromstring(originales['word/document.xml'])
    cuerpo = raiz.find(W+'body')
    nodos = list(cuerpo)
    indices = [(i,texto(n)) for i,n in enumerate(nodos) if n.tag == W+'p' and texto(n) in titulos_capturas]
    assert len(indices) == 15
    primera_foto = indices[0][0]-1
    # Permite volver a ejecutar el builder y evita reordenar accidentalmente una versión ya intercalada.
    if any(n.tag == W+'p' and texto(n) in titulos_casos for n in nodos[primera_foto:]):
        return {'orden': 'ya intercalado', 'fichas': len(casos), 'gruposCapturas': 15}
    assert salto_de_pagina(nodos[primera_foto])
    assert nodos[-1].tag == W+'sectPr'
    seccion = nodos[-1]
    grupos = {}
    for j,(indice,titulo) in enumerate(indices):
        inicio = indice-1
        fin = indices[j+1][0]-1 if j+1 < len(indices) else len(nodos)-1
        assert salto_de_pagina(nodos[inicio])
        grupos[titulo] = nodos[inicio:fin]
    originales_texto = Counter(t.text or '' for t in raiz.iter(W+'t'))
    originales_imagenes = Counter(raiz.xpath('//@r:embed', namespaces={'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}))
    prefijo = nodos[:primera_foto]
    for n in list(cuerpo): cuerpo.remove(n)
    caso_actual = None
    insertados = []
    for nodo in prefijo:
        if nodo.tag == W+'p' and texto(nodo) in titulos_casos:
            caso_actual = titulos_casos[texto(nodo)]
        cuerpo.append(nodo)
        if nodo.tag == W+'tbl' and caso_actual:
            for titulo in CAPTURAS_POR_CASO.get(caso_actual, []):
                for elemento in grupos[titulo]: cuerpo.append(elemento)
                insertados.append(titulo)
            caso_actual = None
    cuerpo.append(seccion)
    assert len(insertados) == 15 and set(insertados) == titulos_capturas
    assert originales_texto == Counter(t.text or '' for t in raiz.iter(W+'t'))
    assert originales_imagenes == Counter(raiz.xpath('//@r:embed', namespaces={'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}))
    xml = etree.tostring(raiz, xml_declaration=True, encoding='UTF-8', standalone=True)
    temporal = ruta.with_suffix('.tmp.docx')
    with ZipFile(temporal,'w') as archivo:
        for info,contenido in partes:
            archivo.writestr(info, xml if info.filename == 'word/document.xml' else contenido)
    with ZipFile(temporal) as archivo:
        assert archivo.testzip() is None
        assert all(archivo.read(nombre) == contenido for nombre,contenido in originales.items() if nombre != 'word/document.xml')
    temporal.replace(ruta)
    return {'orden':'ficha y capturas inmediatas','fichas':len(casos),'gruposCapturas':len(insertados),'documentoSHA256':sha256(ruta.read_bytes()).hexdigest()}

if __name__ == '__main__':
    print(json.dumps(reordenar(),ensure_ascii=False))
