$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3
  $path = Join-Path $PSScriptRoot 'Anteproyecto_FaltaUno_con_CU42_orden_reciente.docx'
  $doc = $word.Documents.Open($path, $false, $true)
  $doc.Repaginate()
  $r = $doc.Content.Duplicate
  $r.Find.ClearFormatting()
  $r.Find.Wrap = 0
  if (-not $r.Find.Execute('CU42 Ver mis actividades iniciadas')) { throw 'No se encontró CU42.' }
  $inicio = $r.Information(3)
  $r2 = $doc.Content.Duplicate
  $r2.SetRange($r.End, $doc.Content.End)
  $r2.Find.Wrap = 0
  if (-not $r2.Find.Execute('Anexo II:')) { throw 'No se encontró el anexo siguiente.' }
  $fin = $r2.Information(3)
  $pdf = Join-Path $PSScriptRoot 'qa/CU42-en-documento.pdf'
  $doc.ExportAsFixedFormat($pdf, 17, $false, 0, 3, $inicio, $fin)
  @{paginasDocumento=$doc.ComputeStatistics(2);inicioCU42=$inicio;inicioAnexoII=$fin;pdf=$pdf} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'qa/paginas-word.json') -Encoding UTF8
  Write-Output ('CU42 verificado y exportado, páginas '+$inicio+' a '+$fin+'.')
} finally {
  if ($doc) { $doc.Close(0) }
  if ($word) { $word.Quit() }
}
