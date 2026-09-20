param([switch]$VerifyOnly)

# Explicit developer provisioning; never runs during app startup or downloads media.
# Pins were reviewed against official release assets on 2026-09-20.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (-not [Environment]::Is64BitOperatingSystem) { throw 'These tools require Windows x64.' }
$toolsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Harmonia/tools'))
$licenseSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/licenses/acquisition'))
$ytHash = '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a'
$denoZipHash = 'a0c3101b4158d1dfb7d6a78a7bf0f3de80c96bb423c152beec8beb22786f2238'
$denoExecutableHash = 'e020f3e232bd16e33768dee528e5983349c962952051ced0a5d58ad42f5d9b33'

function Assert-Hash([string]$Path, [string]$Expected) {
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Expected) {
        throw "Dependency checksum mismatch: $([IO.Path]::GetFileName($Path))"
    }
}

if ($VerifyOnly) {
    Assert-Hash (Join-Path $toolsRoot 'yt-dlp.exe') $ytHash
    Assert-Hash (Join-Path $toolsRoot 'deno.exe') $denoExecutableHash
    Write-Output 'Acquisition tool hashes verified.'
    exit 0
}

New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
$stage = Join-Path $toolsRoot ('install-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    # Retain reviewed notices before fetching executable code. Not a media-rights grant.
    $notices = Join-Path $toolsRoot 'licenses'
    New-Item -ItemType Directory -Path $notices -Force | Out-Null
    foreach ($name in @('yt-dlp-2026.08.19-LICENSE.txt', 'yt-dlp-2026.08.19-THIRD_PARTY_LICENSES.txt', 'deno-v2.9.7-LICENSE.txt')) {
        Copy-Item -LiteralPath (Join-Path $licenseSource $name) -Destination (Join-Path $notices $name) -Force
    }
    $yt = Join-Path $stage 'yt-dlp.exe'
    $denoZip = Join-Path $stage 'deno.zip'
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Uri 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe' -OutFile $yt
    Assert-Hash $yt $ytHash
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Uri 'https://github.com/denoland/deno/releases/download/v2.9.7/deno-x86_64-pc-windows-msvc.zip' -OutFile $denoZip
    Assert-Hash $denoZip $denoZipHash
    # Read the one expected entry explicitly, avoiding arbitrary archive paths.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($denoZip)
    try {
        $entry = $archive.GetEntry('deno.exe')
        if (-not $entry -or $entry.Length -gt 300MB) { throw 'Unexpected Deno archive.' }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $stage 'deno.exe'))
    } finally { $archive.Dispose() }
    $denoHash = (Get-FileHash -LiteralPath (Join-Path $stage 'deno.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Hash (Join-Path $stage 'deno.exe') $denoExecutableHash
    Move-Item -LiteralPath $yt -Destination (Join-Path $toolsRoot 'yt-dlp.exe') -Force
    Move-Item -LiteralPath (Join-Path $stage 'deno.exe') -Destination (Join-Path $toolsRoot 'deno.exe') -Force
    @{
        ytDlpVersion = '2026.08.19'; ytDlpExecutableSha256 = $ytHash
        denoVersion = '2.9.7'; denoArchiveSha256 = $denoZipHash; denoExecutableSha256 = $denoHash
        licenseRecord = 'Harmonia/docs/licenses/acquisition'
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolsRoot 'manifest.json') -Encoding UTF8
    Write-Output "Installed verified yt-dlp 2026.08.19 and Deno 2.9.7 in $toolsRoot"
} finally {
    $resolvedStage = [IO.Path]::GetFullPath($stage)
    if ($resolvedStage.StartsWith($toolsRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    } else { throw 'Refusing cleanup outside tools directory.' }
}
