param(
    [switch]$Prompt,
    [switch]$Replace,
    [switch]$AllowEmpty
)

# Never pass a credential on the command line or print input/error details.
$ErrorActionPreference = 'Stop'
$harmoniaClear = $null
$harmoniaKey = $null
$harmoniaTemp = $null
try {
    Add-Type -AssemblyName System.Security
    $harmoniaDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Harmonia'
    $harmoniaDestination = Join-Path $harmoniaDirectory 'youtube-api-key.dpapi'
    if ((Test-Path -LiteralPath $harmoniaDestination) -and -not $Replace) {
        Write-Output 'Protected YouTube configuration already exists; use -Replace to update it.'
        exit 0
    }

    if ($Prompt) {
        $harmoniaSecure = Read-Host 'YouTube Data API key' -AsSecureString
        $harmoniaKey = [System.Net.NetworkCredential]::new('', $harmoniaSecure).Password
        if ($AllowEmpty -and [string]::IsNullOrWhiteSpace($harmoniaKey)) {
            Write-Output 'YouTube setup skipped. Local-file analysis is available; rerun setup when you have a key.'
            exit 0
        }
    } else {
        $harmoniaSource = Join-Path (Split-Path -Parent $PSScriptRoot) '.env.local'
        if (-not (Test-Path -LiteralPath $harmoniaSource)) { throw 'missing configuration' }
        if ((Get-Item -LiteralPath $harmoniaSource).Length -gt 16384) { throw 'invalid configuration' }
        foreach ($harmoniaLine in [System.IO.File]::ReadAllLines($harmoniaSource)) {
            if ($harmoniaLine -match '^\s*(?:export\s+)?YOUTUBE_API_KEY\s*=\s*(.*?)\s*$') {
                $harmoniaKey = $Matches[1].Trim()
                if ($harmoniaKey.Length -ge 2 -and (($harmoniaKey.StartsWith('"') -and $harmoniaKey.EndsWith('"')) -or ($harmoniaKey.StartsWith("'") -and $harmoniaKey.EndsWith("'")))) {
                    $harmoniaKey = $harmoniaKey.Substring(1, $harmoniaKey.Length - 2)
                }
                break
            }
        }
    }
    if (-not $harmoniaKey -or $harmoniaKey -cnotmatch '^[A-Za-z0-9_-]{20,256}$') { throw 'invalid configuration' }
    $harmoniaClear = [System.Text.Encoding]::UTF8.GetBytes($harmoniaKey)
    $harmoniaProtected = [System.Security.Cryptography.ProtectedData]::Protect($harmoniaClear, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [System.IO.Directory]::CreateDirectory($harmoniaDirectory) | Out-Null
    $harmoniaTemp = Join-Path $harmoniaDirectory ([Guid]::NewGuid().ToString() + '.tmp')
    [System.IO.File]::WriteAllBytes($harmoniaTemp, $harmoniaProtected)
    Move-Item -LiteralPath $harmoniaTemp -Destination $harmoniaDestination -Force
    Write-Output 'YouTube search is configured in protected storage for the current Windows user.'
} catch {
    Write-Output 'YouTube configuration could not be saved. Check the local configuration and Windows account permissions.'
    exit 1
} finally {
    if ($harmoniaClear) { [Array]::Clear($harmoniaClear, 0, $harmoniaClear.Length) }
    $harmoniaKey = $null
    $Matches = $null
    if ($harmoniaTemp -and (Test-Path -LiteralPath $harmoniaTemp)) { Remove-Item -LiteralPath $harmoniaTemp -Force }
}
