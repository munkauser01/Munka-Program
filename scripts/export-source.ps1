$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $projectRoot ('work/source-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
foreach ($name in @('src','electron','server','scripts','tests','assets','.github')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $stage -Recurse
}
foreach ($name in @('package.json','pnpm-lock.yaml','README.md','PRODUCT.md','DESIGN.md','.gitignore')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $stage
}
New-Item -ItemType Directory -Path (Join-Path $stage '.impeccable'),(Join-Path $stage 'outputs') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot '.impeccable/design.json') -Destination (Join-Path $stage '.impeccable')
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'outputs') -File -Filter '*.md' | Copy-Item -Destination (Join-Path $stage 'outputs')
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$archive = Join-Path $projectRoot ('outputs/Munka-Source-' + $version + '.zip')
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $archive)
Get-Item -LiteralPath $archive | Select-Object FullName,Length
