$ErrorActionPreference='Stop'
$word=$null
$doc=$null
try {
  $word=New-Object -ComObject Word.Application
  $word.Visible=$false
  $word.DisplayAlerts=0
  $word.AutomationSecurity=3
  $doc=$word.Documents.Open((Join-Path $PSScriptRoot 'Anteproyecto_FaltaUno_CU42_y_testing_2026-11-27.docx'),$false,$true)
  $doc.Repaginate()
  $paginas=@{}
  $desde=0
  foreach($titulo in @('CU42 Ver mis actividades iniciadas','Anexo II:','Testing CU42','Anexo V:')) {
    $r=$doc.Content.Duplicate
    $r.SetRange($desde,$doc.Content.End)
    $r.Find.ClearFormatting()
    $r.Find.Wrap=0
    if (-not $r.Find.Execute($titulo)) { throw "No se encontró: $titulo" }
    $paginas[$titulo]=$r.Information(3)
    $desde=$r.End
  }
  $render=Join-Path $PSScriptRoot 'render'
  New-Item -ItemType Directory -Path $render -Force | Out-Null
  $doc.ExportAsFixedFormat((Join-Path $render 'CU42.pdf'),17,$false,0,3,$paginas['CU42 Ver mis actividades iniciadas'],$paginas['Anexo II:'])
  $doc.ExportAsFixedFormat((Join-Path $render 'Testing-CU42.pdf'),17,$false,0,3,$paginas['Testing CU42'],$paginas['Anexo V:'])
  @{paginasDocumento=$doc.ComputeStatistics(2);apartados=$paginas} | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $PSScriptRoot 'paginas-verificadas.json') -Encoding utf8
  Write-Output ('Documento verificado. CU42: '+$paginas['CU42 Ver mis actividades iniciadas']+'; testing: '+$paginas['Testing CU42']+' a '+$paginas['Anexo V:'])
} finally {
  if($doc) { $doc.Close(0) }
  if($word) { $word.Quit() }
}
