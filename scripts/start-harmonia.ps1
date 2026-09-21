param([switch]$CheckOnly, [switch]$SetupOnly, [switch]$NonInteractive)
$ErrorActionPreference = 'Stop'
try {
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
        throw 'This launcher currently supports Windows x64 only.'
    }
    $script:HarmoniaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    Set-Location -LiteralPath $script:HarmoniaRoot
    . (Join-Path $PSScriptRoot 'startup-workflow.ps1')
    . (Join-Path $PSScriptRoot 'startup-environment.ps1')
    Update-HarmoniaPath
    Write-Host 'Harmonia - checking your local setup.'
    if (-not $CheckOnly) {
        Write-Host 'First setup may download several GB and request Windows installer approval. Existing compatible tools are reused.'
    }
    $result = Invoke-HarmoniaStartup -Adapter @{
        Check = { param($name) Test-HarmoniaRequirement $name }
        Install = { param($name) Install-HarmoniaRequirement $name }
        KeyConfigured = { Test-HarmoniaSearchKey }
        ConfigureKey = { Initialize-HarmoniaSearchKey }
        Say = { param($message) Write-Host $message }
        Launch = {
            $env:CARGO_BUILD_JOBS = '2'
            $env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
            Write-Host 'Starting Harmonia...'
            Invoke-HarmoniaCommand 'npm.cmd' @('run', 'desktop:dev')
        }
    } -CheckOnly:$CheckOnly -SetupOnly:$SetupOnly -NonInteractive:($NonInteractive -or [Console]::IsInputRedirected)
    if (-not $result.Ready) {
        Write-Host ('Missing: ' + ($result.Missing -join ', ') + '. Run without -CheckOnly to set up.')
        exit 1
    }
    if ($SetupOnly -or $CheckOnly) { Write-Host 'Harmonia dependencies are ready. No desktop window was opened.' }
} catch {
    # Never dump invocation arguments/environment or credentials on failure.
    Write-Host ('Harmonia startup stopped: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
