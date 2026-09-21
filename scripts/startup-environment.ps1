# Windows adapters. No application window is opened except by the workflow's Launch.
function Update-HarmoniaPath {
    $extra = @(
        [Environment]::GetEnvironmentVariable('PATH', 'User'),
        [Environment]::GetEnvironmentVariable('PATH', 'Machine'),
        (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.cargo/bin'),
        (Join-Path $env:LOCALAPPDATA 'Programs/Python/Python313'),
        (Join-Path $env:LOCALAPPDATA 'Programs/Python/Launcher')
    )
    $env:PATH = ((@($env:PATH) + $extra) | Where-Object { $_ }) -join ';'
    # A compatible system installation must win over an obsolete inherited shim.
    $systemNode = Join-Path $env:ProgramFiles 'nodejs'
    $node = Join-Path $systemNode 'node.exe'
    if ((Test-Path -LiteralPath $node) -and (Test-HarmoniaCommand $node @('-e', 'process.exit(parseInt(process.versions.node,10) >= 24 ? 0 : 1)'))) {
        $env:PATH = $systemNode + ';' + $env:PATH
    }
}
function Invoke-HarmoniaCommand {
    param([string]$File, [string[]]$Arguments)
    & $File @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "A setup command failed (exit $LASTEXITCODE). Review the output above; setup can be resumed by running again." }
}
function Test-HarmoniaCommand {
    param([string]$File, [string[]]$Arguments)
    try { & $File @Arguments *> $null; return $LASTEXITCODE -eq 0 } catch { return $false }
}
function Get-HarmoniaPython {
    if ((Get-Command py.exe -ErrorAction SilentlyContinue) -and (Test-HarmoniaCommand 'py.exe' @('-3.13', '-c', 'import sys; sys.exit(0 if sys.maxsize>2**32 else 1)'))) {
        $path = & py.exe -3.13 -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0 -and $path -and (Test-Path -LiteralPath "$path")) { return "$path" }
    }
    foreach ($path in @(
        (Join-Path $env:LOCALAPPDATA 'Programs/Python/Python313/python.exe'),
        (Join-Path $env:ProgramFiles 'Python313/python.exe'),
        (Join-Path $script:HarmoniaRoot 'ml/.venv/Scripts/python.exe')
    )) {
        if ((Test-Path -LiteralPath $path) -and (Test-HarmoniaCommand $path @('-c', 'import sys; sys.exit(0 if sys.version_info[:2]==(3,13) and sys.maxsize>2**32 else 1)'))) { return $path }
    }
    return $null
}
function Get-HarmoniaVS {
    param([switch]$WithCpp, [switch]$BuildToolsOnly)
    $vswhere = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswhere)) { return $null }
    $product = if ($BuildToolsOnly) { 'Microsoft.VisualStudio.Product.BuildTools' } else { '*' }
    $arguments = @('-latest', '-products', $product, '-property', 'installationPath')
    if ($WithCpp) { $arguments += @('-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64') }
    $path = & $vswhere @arguments
    return ($path | Select-Object -First 1)
}
function Test-HarmoniaSdk {
    $kits = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots' -ErrorAction SilentlyContinue
    if (-not $kits -or -not $kits.KitsRoot10) { return $false }
    foreach ($directory in @(Get-ChildItem -LiteralPath (Join-Path $kits.KitsRoot10 'Include') -Directory -ErrorAction SilentlyContinue)) {
        if ((Test-Path -LiteralPath (Join-Path $directory.FullName 'um/Windows.h')) -and
            (Test-Path -LiteralPath (Join-Path $kits.KitsRoot10 "Lib/$($directory.Name)/um/x64/kernel32.lib"))) { return $true }
    }
    return $false
}
function Test-HarmoniaRequirement {
    param([string]$Name)
    switch ($Name) {
        'Node' {
            if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { return $false }
            return Test-HarmoniaCommand 'node.exe' @('-e', 'process.exit(parseInt(process.versions.node,10) >= 24 ? 0 : 1)')
        }
        'Cpp' { return [bool]((Get-HarmoniaVS -WithCpp) -and (Test-HarmoniaSdk)) }
        'Rust' {
            if (-not (Get-Command rustup.exe -ErrorAction SilentlyContinue)) { return $false }
            try {
                $version = & rustup.exe run stable-x86_64-pc-windows-msvc rustc --version 2>$null
                return $LASTEXITCODE -eq 0 -and $version -match 'rustc (\d+\.\d+\.\d+)' -and [version]$Matches[1] -ge [version]'1.97.1'
            } catch { return $false }
        }
        'WebView' {
            foreach ($path in @('HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\*', 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\*', 'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\*')) {
                foreach ($item in @(Get-ItemProperty $path -ErrorAction SilentlyContinue)) {
                    if ($item.name -like '*WebView2*' -and $item.pv -and $item.pv -ne '0.0.0.0') { return $true }
                }
            }
            return $false
        }
        'Python' { return [bool](Get-HarmoniaPython) }
        'Frontend' {
            if (-not (Test-Path -LiteralPath (Join-Path $script:HarmoniaRoot 'node_modules/.bin/tauri.cmd'))) { return $false }
            $stamp = Join-Path $script:HarmoniaRoot 'node_modules/.harmonia-package-lock.sha256'
            if ((Test-Path -LiteralPath $stamp) -and ([IO.File]::ReadAllText($stamp).Trim() -ne (Get-FileHash -LiteralPath 'package-lock.json').Hash)) { return $false }
            return Test-HarmoniaCommand 'npm.cmd' @('ls', '--depth=0')
        }
        'Recognition' {
            $python = Join-Path $script:HarmoniaRoot 'ml/.venv/Scripts/python.exe'
            if (-not (Test-Path -LiteralPath $python)) { return $false }
            return Test-HarmoniaCommand $python @('-I', (Join-Path $PSScriptRoot 'check_recognition_environment.py'))
        }
        'Acquisition' { return Test-HarmoniaCommand 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'prepare-acquisition-tools.ps1'), '-VerifyOnly') }
        default { throw "Unknown setup requirement: $Name" }
    }
}
function Install-HarmoniaWinget {
    param([string]$Id, [string[]]$Extra = @())
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        throw 'Windows App Installer (WinGet) is missing. Install/update App Installer from Microsoft Store, then run Harmonia again. Manual setup is in README.md.'
    }
    Write-Host "Installing $Id using the Windows package manager. Windows may request administrator approval."
    Invoke-HarmoniaCommand 'winget.exe' (@('install', '--id', $Id, '--exact', '--source', 'winget', '--architecture', 'x64', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity') + $Extra)
    Update-HarmoniaPath
}
function Install-HarmoniaRequirement {
    param([string]$Name)
    switch ($Name) {
        'Node' { Install-HarmoniaWinget 'OpenJS.NodeJS.LTS' @('--version', '24.11.1') }
        'Cpp' {
            $existing = Get-HarmoniaVS -BuildToolsOnly
            if ($existing) {
                $installer = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/setup.exe'
                $process = Start-Process -FilePath $installer -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('modify', '--installPath', ('"' + $existing + '"'), '--add', 'Microsoft.VisualStudio.Workload.VCTools', '--includeRecommended', '--passive', '--norestart')
                if ($process.ExitCode -ne 0) { throw "C++ tools setup returned $($process.ExitCode). A restart may be required; rerun Harmonia afterward." }
            } else {
                Install-HarmoniaWinget 'Microsoft.VisualStudio.2022.BuildTools' @('--override', '--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --norestart')
            }
        }
        'Rust' {
            if (-not (Get-Command rustup.exe -ErrorAction SilentlyContinue)) { Install-HarmoniaWinget 'Rustlang.Rustup' }
            Invoke-HarmoniaCommand 'rustup.exe' @('toolchain', 'install', 'stable-x86_64-pc-windows-msvc', '--profile', 'minimal', '--component', 'rustfmt', '--component', 'clippy')
        }
        'WebView' { Install-HarmoniaWinget 'Microsoft.EdgeWebView2Runtime' }
        'Python' { Install-HarmoniaWinget 'Python.Python.3.13' }
        'Frontend' {
            Invoke-HarmoniaCommand 'npm.cmd' @('ci')
            [IO.File]::WriteAllText((Join-Path $script:HarmoniaRoot 'node_modules/.harmonia-package-lock.sha256'), (Get-FileHash -LiteralPath 'package-lock.json').Hash)
        }
        'Recognition' {
            $python = Join-Path $script:HarmoniaRoot 'ml/.venv/Scripts/python.exe'
            if (-not (Test-Path -LiteralPath $python)) {
                $base = Get-HarmoniaPython
                if (-not $base) { throw 'Python 3.13 was not found after installation.' }
                Invoke-HarmoniaCommand $base @('-m', 'venv', (Join-Path $script:HarmoniaRoot 'ml/.venv'))
            }
            if (-not (Test-HarmoniaCommand $python @('-c', 'import sys; sys.exit(0 if sys.version_info[:2]==(3,13) and sys.maxsize>2**32 else 1)'))) {
                throw 'Existing ml/.venv is not Python 3.13 x64. It was preserved; move it aside before rerunning setup.'
            }
            Invoke-HarmoniaCommand $python @('-m', 'pip', 'install', '--upgrade', 'pip')
            Invoke-HarmoniaCommand $python @('-m', 'pip', 'install', 'torch==2.11.0+cu128', '--index-url', 'https://download.pytorch.org/whl/cu128')
            Invoke-HarmoniaCommand $python @('-m', 'pip', 'install', '-r', (Join-Path $script:HarmoniaRoot 'ml/requirements-lock-win-py313.txt'))
            if (-not (Test-HarmoniaRequirement 'Recognition')) {
                # Reinstall only the pinned distribution if its bundled weights are damaged.
                Invoke-HarmoniaCommand $python @('-m', 'pip', 'install', '--force-reinstall', '--no-deps', 'lv-chordia==1.1.0')
            }
            Invoke-HarmoniaCommand $python @('-m', 'pip', 'check')
        }
        'Acquisition' { Invoke-HarmoniaCommand 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'prepare-acquisition-tools.ps1')) }
        default { throw "Unknown setup requirement: $Name" }
    }
}
function Test-HarmoniaSearchKey {
    if ($env:YOUTUBE_API_KEY -cmatch '^[A-Za-z0-9_-]{20,256}$') { return $true }
    $local = Join-Path $script:HarmoniaRoot '.env.local'
    if ((Test-Path -LiteralPath $local) -and (Get-Item -LiteralPath $local).Length -le 16384) {
        foreach ($line in [IO.File]::ReadAllLines($local)) {
            if ($line -match '^\s*(?:export\s+)?YOUTUBE_API_KEY\s*=\s*(.*?)\s*$') {
                if ($Matches[1].Trim().Trim([char]34, [char]39) -cmatch '^[A-Za-z0-9_-]{20,256}$') { return $true }
            }
        }
    }
    $protected = Join-Path $env:LOCALAPPDATA 'Harmonia/youtube-api-key.dpapi'
    $clear = $null
    try {
        if (-not (Test-Path -LiteralPath $protected) -or (Get-Item -LiteralPath $protected).Length -gt 16384) { return $false }
        Add-Type -AssemblyName System.Security
        $clear = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($protected), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        return [Text.Encoding]::UTF8.GetString($clear) -cmatch '^[A-Za-z0-9_-]{20,256}$'
    } catch { return $false }
    finally { if ($clear) { [Array]::Clear($clear, 0, $clear.Length) }; $Matches = $null }
}
function Initialize-HarmoniaSearchKey {
    Write-Host 'YouTube search needs your own YouTube Data API v3 key (Google Cloud). It is saved securely for this Windows user.'
    Write-Host 'Enter the key in the masked prompt, or press Enter to start with local files only.'
    Invoke-HarmoniaCommand 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'configure-youtube.ps1'), '-Prompt', '-AllowEmpty', '-Replace')
}
