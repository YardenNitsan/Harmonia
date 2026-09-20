param(
    [ValidateSet('Prepare', 'Start', 'Stop', 'Status')][string]$Action = 'Status',
    [ValidateRange(1024, 65535)][int]$Port = 19000
)
$ErrorActionPreference = 'Stop'
$revision = 'a636575b09de1fc55d9b8cd98cac88f5f2f16b42'
$root = Join-Path $env:LOCALAPPDATA 'Harmonia/tools/cobalt-a636575'
$statePath = Join-Path $root 'harmonia-process.json'

if ($Action -eq 'Prepare') {
    if (-not (Test-Path -LiteralPath $root)) {
        git clone --quiet --filter=blob:none --no-checkout https://github.com/imputnet/cobalt.git $root
        if ($LASTEXITCODE -ne 0) { throw 'Cobalt source download failed.' }
        git -C $root checkout --quiet $revision
        if ($LASTEXITCODE -ne 0) { throw 'Cobalt checkout failed.' }
    }
    if ((git -C $root rev-parse HEAD) -ne $revision) { throw 'Unexpected Cobalt checkout; preserve it and inspect manually.' }
    Push-Location $root
    try {
        # Locked dependencies; no arbitrary lifecycle scripts, ffmpeg downloads or token servers.
        npx.cmd --yes pnpm@9.6.0 --filter @imput/cobalt-api... install --frozen-lockfile --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'Cobalt dependency installation failed.' }
    } finally { Pop-Location }
    Write-Output 'Prepared pinned Cobalt. Only native M4A passthrough is verified; no FFmpeg is installed.'
    exit 0
}

$saved = if (Test-Path -LiteralPath $statePath) { Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } else { $null }
$existing = if ($saved) { Get-Process -Id $saved.processId -ErrorAction SilentlyContinue } else { $null }
$ownsProcess = $existing -and $existing.ProcessName -eq 'node' -and $existing.StartTime.ToUniversalTime().Ticks.ToString() -eq $saved.startedUtcTicks
if ($Action -eq 'Stop') {
    if ($ownsProcess) { Stop-Process -Id $existing.Id }
    if ($saved) { Remove-Item -LiteralPath $statePath }
    Write-Output 'Owned Cobalt process stopped (or already absent).'
    exit 0
}
if ($Action -eq 'Status') {
    Write-Output $(if ($ownsProcess) { "Cobalt running at $($saved.url)" } else { 'Cobalt is not running through this script.' })
    exit 0
}
if ($ownsProcess) { Write-Output "Cobalt already running at $($saved.url)"; exit 0 }
if (-not (Test-Path -LiteralPath (Join-Path $root 'api/node_modules'))) { throw 'Run cobalt-local.ps1 Prepare first.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'Requested local port is already in use; no unrelated process was stopped.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$env:API_URL = "http://127.0.0.1:$Port/"
$env:API_LISTEN_ADDRESS = '127.0.0.1'
$env:API_PORT = "$Port"
$env:DURATION_LIMIT = '1200'
$env:CORS_WILDCARD = '0'
$env:CORS_URL = 'http://tauri.localhost'
$env:FORCE_LOCAL_PROCESSING = 'never'
$env:RATELIMIT_MAX = '20'
$env:TUNNEL_LIFESPAN = '60'
$process = Start-Process -FilePath $node -ArgumentList 'api/src/cobalt.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'harmonia-output.log') -RedirectStandardError (Join-Path $root 'harmonia-error.log')
@{ processId=$process.Id; startedUtcTicks=$process.StartTime.ToUniversalTime().Ticks.ToString(); url=$env:API_URL; revision=$revision } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
Write-Output "Started private Cobalt process $($process.Id) at $env:API_URL"
