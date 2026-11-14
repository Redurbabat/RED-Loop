[CmdletBinding()]
param([switch]$NoBrowser,[switch]$SkipTests)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $repository
try {
    Write-Host 'RED LOOP - Windows ChatGPT test' -ForegroundColor Cyan
    Write-Host "Repository: $repository"
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $node -or -not $npm) {
        throw 'Node.js 22+ und npm wurden nicht gefunden. Installiere Node.js LTS.'
    }
    $version = (& $node.Source --version).Trim()
    if ($LASTEXITCODE -ne 0 -or -not ($version -match '^v([0-9]+)\.')) {
        throw 'Node.js konnte seine Version nicht ausgeben.'
    }
    if ([int]$Matches[1] -lt 22) {
        throw "Node.js 22 oder neuer ist erforderlich: $version"
    }
    Write-Host "Node.js: $version" -ForegroundColor Green

    # Never pull/reset automatically: local changes remain untouched.
    if (-not (Test-Path -LiteralPath (Join-Path $repository 'node_modules/.package-lock.json') -PathType Leaf)) {
        Write-Host 'Installiere Abhaengigkeiten ...'
        & $npm.Source ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci fehlgeschlagen.' }
    }

    Write-Host 'Erstelle die lokale ChatGPT-Erweiterung ...'
    & $npm.Source run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build fehlgeschlagen.' }
    & $npm.Source run check
    if ($LASTEXITCODE -ne 0) { throw 'npm run check fehlgeschlagen.' }
    if (-not $SkipTests) {
        & $npm.Source test
        if ($LASTEXITCODE -ne 0) { throw 'npm test fehlgeschlagen.' }
    }

    $extension = Join-Path $repository 'extensions/chromium'
    $manifestFile = Join-Path $extension 'manifest.json'
    $packagedScript = Join-Path $extension 'red-loop.user.js'
    $canonicalScript = Join-Path $repository 'userscripts/red-loop.user.js'
    foreach ($file in @($manifestFile,$packagedScript,$canonicalScript)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Datei fehlt: $file" }
    }

    $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
    if ($manifest.manifest_version -ne 3 -or $manifest.name -ne 'RED Loop') {
        throw 'Unerwartetes Manifest fuer Browser-Erweiterung.'
    }
    $scriptNames = @($manifest.content_scripts | ForEach-Object { $_.js } | ForEach-Object { $_ })
    $hosts = @($manifest.content_scripts | ForEach-Object { $_.matches } | ForEach-Object { $_ })
    if ($scriptNames -notcontains 'red-loop.user.js' -or $hosts -notcontains 'https://chatgpt.com/*') {
        throw 'Manifest erlaubt nicht das erwartete ChatGPT-Skript.'
    }

    $packagedHash = (Get-FileHash -LiteralPath $packagedScript -Algorithm SHA256).Hash
    $canonicalHash = (Get-FileHash -LiteralPath $canonicalScript -Algorithm SHA256).Hash
    if ($packagedHash -ne $canonicalHash) {
        throw 'Paket ist nicht bytegleich mit der Skriptquelle.'
    }
    Write-Host 'OK: Build, Manifest, Skriptquelle und SHA-256 stimmen.' -ForegroundColor Green
    Write-Host "ERWEITERUNGSORDNER: $extension" -ForegroundColor Cyan

    if ($NoBrowser) {
        Write-Host 'Headless Windows-Pruefung abgeschlossen; Browser bleibt geschlossen.'
        return
    }

    $locations = @()
    if ($env:ProgramFiles) { $locations += (Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe') }
    $x86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($x86) { $locations += (Join-Path $x86 'Microsoft/Edge/Application/msedge.exe') }
    if ($env:LOCALAPPDATA) { $locations += (Join-Path $env:LOCALAPPDATA 'Microsoft/Edge/Application/msedge.exe') }
    $edge = $locations | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $edge) {
        $found = Get-Command msedge.exe -ErrorAction SilentlyContinue
        if ($found) { $edge = $found.Source }
    }
    Start-Process -FilePath explorer.exe -ArgumentList ('"' + $extension + '"')
    if ($edge) {
        Start-Process -FilePath $edge -ArgumentList 'edge://extensions/'
        Start-Process -FilePath $edge -ArgumentList 'https://chatgpt.com/'
    } else {
        Write-Warning 'Edge nicht gefunden: edge://extensions/ manuell oeffnen.'
    }
    Write-Host 'EINMALIG: Edge -> Entwicklermodus -> Entpackte Erweiterung laden -> den Ordner oben waehlen.'
    Write-Host 'DANACH: bestehenden ChatGPT-Chat neu laden und mit Limit 1 testen.'
    Write-Host 'Das Skript startet keine ChatGPT-Nachrichten automatisch.' -ForegroundColor Yellow
} finally { Pop-Location }
