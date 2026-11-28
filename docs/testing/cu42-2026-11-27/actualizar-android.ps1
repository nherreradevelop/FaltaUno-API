$ErrorActionPreference = 'Stop'
$carpetaEvidenciaCu42 = $PSScriptRoot
$fuente = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verificar-android.ps1') -Raw
$definiciones = ($fuente -split '(?m)^try \{',2)[0]
Invoke-Expression $definiciones
function Captura([string]$nombre) {
  adb -e shell screencap -p /sdcard/cu42-testing.png | Out-Null
  adb -e pull /sdcard/cu42-testing.png (Join-Path $carpetaEvidenciaCu42 "capturas/android-$nombre.png") 2>&1 | Out-Null
}
try {
  Escenario 'normal'
  adb -e reverse tcp:3000 tcp:3002 | Out-Null
  IniciarApp
  Esperar 'Correo electrónico' | Out-Null
  Login
  Tocar 'Mis actividades'
  Esperar 'Actividad de hoy CU42' | Out-Null
  Escenario 'vacio'
  Tocar 'Actualizar'
  Esperar 'Todavía no participás en ninguna actividad iniciada.' | Out-Null
  Captura 'actualizado'
  Escenario 'normal'
  Tocar 'Actualizar'
  Esperar 'Actividad de hoy CU42' | Out-Null
  Esperar 'es hoy!' | Out-Null
  Captura 'actualizado-restaurado'
  $archivo = Join-Path $PSScriptRoot 'android-ejecucion.json'
  $reporte = Get-Content -LiteralPath $archivo -Raw | ConvertFrom-Json
  $reporte.casos = @($reporte.casos | Where-Object { $_.id -ne 'CP-CU42-11' }) + @{
    id='CP-CU42-11';estado='aprobado';obtenido='Actualizar retira del listado las actividades archivadas en SQL. Al restaurar el escenario, recupera las iniciadas y la etiqueta es hoy!.'
  }
  $reporte | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $archivo -Encoding utf8
  Write-Output 'CP-CU42-11 Android aprobado con capturas.'
} finally {
  Escenario 'normal'
  adb -e reverse tcp:3000 tcp:3000 | Out-Null
  IniciarApp
  Esperar 'Correo electrónico' | Out-Null
  Login
  Esperar 'Tenes actividades que comienzan hoy!' | Out-Null
  Write-Output 'Restaurada la app habitual de Elian en Explorar.'
}
