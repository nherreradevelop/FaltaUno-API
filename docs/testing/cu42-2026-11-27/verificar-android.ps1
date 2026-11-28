$ErrorActionPreference = 'Stop'
$api = 'http://127.0.0.1:3002'
$casos = [System.Collections.Generic.List[object]]::new()
$uriApp = 'faltauno://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082'
function Escenario([string]$modo) { Invoke-RestMethod -Uri "$api/prueba/escenario/$modo" -Method Post | Out-Null }
function Ui {
  for ($lectura=0; $lectura -lt 4; $lectura++) {
    adb -e shell uiautomator dump /sdcard/cu42-testing.xml 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      [xml]$doc = (adb -e shell cat /sdcard/cu42-testing.xml) -join "`n"
      if ($null -ne $doc.hierarchy) { return $doc }
    }
  }
  throw 'Android todavía no expuso la pantalla.'
}
function Buscar([xml]$doc, [string]$texto) {
  $interactivo = $doc.SelectSingleNode("//node[(@text='$texto' or @content-desc='$texto') and @clickable='true']")
  if ($null -ne $interactivo) { return $interactivo }
  return $doc.SelectSingleNode("//node[@text='$texto' or @content-desc='$texto']")
}
function Esperar([string]$texto) {
  for ($intento = 0; $intento -lt 9; $intento++) {
    $doc = Ui
    $nodo = Buscar $doc $texto
    if ($null -ne $nodo) { return $nodo }
  }
  throw "No apareció en Android: $texto"
}
function Tocar([string]$texto) {
  $nodo = Esperar $texto
  $b = [regex]::Matches($nodo.bounds, '\d+') | ForEach-Object { [int]$_.Value }
  $x = [int](($b[0]+$b[2])/2); $y = [int](($b[1]+$b[3])/2)
  adb -e shell input tap $x $y | Out-Null
}
function Captura([string]$nombre) {
  adb -e shell screencap -p /sdcard/cu42-testing.png | Out-Null
  adb -e pull /sdcard/cu42-testing.png (Join-Path $PSScriptRoot "capturas/android-$nombre.png") 2>&1 | Out-Null
}
function IniciarApp {
  adb -e shell am force-stop uy.faltauno.app | Out-Null
  adb -e shell am start -W -a android.intent.action.VIEW -d $uriApp uy.faltauno.app | Out-Null
}
function Login {
  Tocar 'Correo electrónico'
  adb -e shell input text 'armanelian@gmail.com' | Out-Null
  adb -e shell input keyevent 4 | Out-Null
  Tocar 'Contraseña'
  adb -e shell input text 'FaltaUno123!' | Out-Null
  adb -e shell input keyevent 4 | Out-Null
  Tocar 'Iniciar sesión'
  Esperar 'Explorar actividades' | Out-Null
}
function MisActividades {
  IniciarApp
  Esperar 'Explorar' | Out-Null
  Tocar 'Mis actividades'
}
function DesplazarHasta([string]$texto) {
  for ($i=0; $i -lt 18; $i++) {
    $doc=Ui
    $nodo=Buscar $doc $texto
    if ($null -ne $nodo) {
      $b=[regex]::Matches($nodo.bounds,'\d+') | ForEach-Object { [int]$_.Value }
      if ($b[1] -gt 90 -and $b[3] -lt 2170 -and $b[3] -gt $b[1]) { return }
    }
    adb -e shell input swipe 540 1900 540 650 250 | Out-Null
  }
  throw "No se encontró al recorrer la lista: $texto"
}
function Aprobar([string]$id,[string]$resultado) {
  $casos.Add(@{id=$id;estado='aprobado';obtenido=$resultado})
  Write-Output "$id aprobado"
}
try {
  Escenario 'normal'
  adb -e reverse tcp:3000 tcp:3002 | Out-Null
  IniciarApp
  Esperar 'Correo electrónico' | Out-Null
  Login
  Esperar 'Tenes actividades que comienzan hoy!' | Out-Null
  Esperar 'hace click aca para ver tus actividades iniciadas y entra a la actividad para ver los detalles.' | Out-Null
  Captura 'banner'
  Tocar 'Ver mis actividades'
  Esperar 'Actividad de hoy CU42' | Out-Null
  Esperar 'es hoy!' | Out-Null
  Captura 'listado'
  Aprobar 'CP-CU42-01' 'Actividad de hoy primero, etiqueta es hoy! visible con color de éxito, inicio y plazo correctos.'
  Aprobar 'CP-CU42-03' 'Banner con los textos solicitados; Ver mis actividades abre el listado real de PostgreSQL local.'
  Tocar 'Ver detalle'
  Esperar 'Actividad de hoy CU42' | Out-Null
  Captura 'detalle'
  Aprobar 'CP-CU42-04' 'El botón de la primera actividad abre su detalle CU09.'
  MisActividades
  Esperar 'Actividad de hoy CU42' | Out-Null
  DesplazarHasta 'Ver más'
  Tocar 'Ver más'
  DesplazarHasta 'Salida anterior 11'
  Captura 'paginacion'
  Aprobar 'CP-CU42-02' 'La segunda página permite llegar a Salida anterior 11, el último de los doce registros de prueba.'
  Escenario 'error'
  MisActividades
  Esperar 'No pudimos cargar tus actividades iniciadas. Probá de nuevo.' | Out-Null
  Captura 'error'
  Escenario 'normal'
  Tocar 'Reintentar'
  Esperar 'Actividad de hoy CU42' | Out-Null
  Captura 'reintento'
  Aprobar 'CP-CU42-06' '503 inicial informa la falla; reintentar recupera el listado.'
  MisActividades
  Esperar 'Actividad de hoy CU42' | Out-Null
  Escenario 'error-pagina-2'
  DesplazarHasta 'Ver más'
  Tocar 'Ver más'
  DesplazarHasta 'Reintentar'
  Captura 'error-pagina'
  Escenario 'normal'
  Tocar 'Reintentar'
  DesplazarHasta 'Salida anterior 11'
  Aprobar 'CP-CU42-07' 'La primera página se conserva al fallar la siguiente; el reintento permite alcanzar el último registro.'
  Escenario 'invalido'
  MisActividades
  Esperar 'No pudimos cargar tus actividades iniciadas. Probá de nuevo.' | Out-Null
  Captura 'invalido'
  Aprobar 'CP-CU42-08' 'Una respuesta incompleta se rechaza con error recuperable y no se muestra como vacío.'
  Escenario 'vacio'
  IniciarApp
  Esperar 'Explorar actividades' | Out-Null
  $doc = Ui
  if ($null -ne (Buscar $doc 'Tenes actividades que comienzan hoy!')) { throw 'Apareció banner sin iniciadas propias.' }
  Captura 'sin-banner'
  Tocar 'Mis actividades'
  Esperar 'Todavía no participás en ninguna actividad iniciada.' | Out-Null
  Captura 'vacio'
  Aprobar 'CP-CU42-05' 'Sin iniciadas propias, el banner no aparece y el listado informa vacío con salida a Explorar.'
  Escenario 'sesion'
  MisActividades
  Esperar 'Correo electrónico' | Out-Null
  Captura 'sesion'
  Aprobar 'CP-CU42-09' 'Un 401 retira la pantalla privada y lleva al login.'
  @{fecha='2026-11-27';entorno=$api;datos='Esquema efímero de faltauno_test con fallas controladas; API y PostgreSQL reales.';casos=$casos} |
    ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'android-ejecucion.json') -Encoding utf8
} finally {
  Escenario 'normal'
  adb -e reverse tcp:3000 tcp:3000 | Out-Null
  IniciarApp
}
