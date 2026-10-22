# Anade la direccion del backend y la clave de la app a un .ipa descargado de GitHub Actions.
# El .ipa de GitHub no lleva claves (el repositorio es publico); esto se hace solo en tu PC.
# La clave se lee de backend/.dev.vars (CLAVE_APP) y no se muestra en pantalla.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File ios\scripts\configurar-ipa.ps1 -Ipa "$HOME\Downloads\DupeFinder.ipa" -UrlBackend "https://dupe-finder.TU-USUARIO.workers.dev"
#
# Crea DupeFinder-configurada.ipa junto al original. Instala ese con Sideloadly.
param(
    [Parameter(Mandatory = $true)][string]$Ipa,
    [Parameter(Mandatory = $true)][string]$UrlBackend
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $Ipa)) { throw "No encuentro el archivo: $Ipa" }
if ($UrlBackend -notmatch '^https?://[^/\s]+') { throw "La direccion del backend debe empezar por https://" }
if ($UrlBackend -match '^http://' -and $UrlBackend -notmatch '^http://(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)') {
    throw "En un iPhone solo funciona https:// (salvo direcciones de tu red local)."
}
$UrlBackend = $UrlBackend.TrimEnd('/')

# Clave de la app desde backend/.dev.vars
$vars = Join-Path $PSScriptRoot "..\..\backend\.dev.vars"
if (-not (Test-Path $vars)) { throw "No encuentro backend\.dev.vars" }
$linea = Get-Content $vars | Where-Object { $_ -match '^\s*CLAVE_APP\s*=' } | Select-Object -First 1
if (-not $linea) { throw "backend\.dev.vars no tiene CLAVE_APP" }
$clave = ($linea -replace '^\s*CLAVE_APP\s*=\s*', '').Trim().Trim('"')
if ($clave.Length -eq 0) { throw "CLAVE_APP esta vacia en backend\.dev.vars" }

function Escapar([string]$texto) {
    return $texto.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
}

$entrada = (Resolve-Path $Ipa).Path
$salida = Join-Path (Split-Path $entrada) "DupeFinder-configurada.ipa"
Copy-Item $entrada $salida -Force

$utf8 = New-Object System.Text.UTF8Encoding $false
$zip = [System.IO.Compression.ZipFile]::Open($salida, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    # Info.plist de la app y de la Share Extension (las dos hablan con el backend).
    $rutas = @(
        "Payload/DupeFinder.app/Info.plist",
        "Payload/DupeFinder.app/PlugIns/DupeFinderShare.appex/Info.plist"
    )
    foreach ($ruta in $rutas) {
        # Acepta "/" y "\" en las rutas (los zip hechos en Windows usan "\").
        $elemento = $zip.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq $ruta } | Select-Object -First 1
        if (-not $elemento) { throw "El .ipa no contiene $ruta" }
        $nombre = $elemento.FullName
        $lector = New-Object System.IO.StreamReader($elemento.Open(), $utf8)
        $texto = $lector.ReadToEnd()
        $lector.Close()
        if ($texto -notmatch '<key>URL_BACKEND</key>') {
            throw "$ruta no es un plist en texto: descarga el .ipa de la ultima compilacion."
        }
        $texto = [regex]::Replace($texto, '(<key>URL_BACKEND</key>\s*<string>)[^<]*(</string>)', { param($m) $m.Groups[1].Value + (Escapar $UrlBackend) + $m.Groups[2].Value })
        $texto = [regex]::Replace($texto, '(<key>CLAVE_APP</key>\s*<string>)[^<]*(</string>)', { param($m) $m.Groups[1].Value + (Escapar $clave) + $m.Groups[2].Value })
        $elemento.Delete()
        $nuevo = $zip.CreateEntry($nombre)
        $escritor = New-Object System.IO.StreamWriter($nuevo.Open(), $utf8)
        $escritor.Write($texto)
        $escritor.Close()
    }
}
finally {
    $zip.Dispose()
}

Write-Output "Listo: $salida"
Write-Output "Backend: $UrlBackend (clave de $($clave.Length) caracteres anadida)"
Write-Output "Instala ese archivo con Sideloadly."
