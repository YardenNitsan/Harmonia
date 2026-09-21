$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'startup-workflow.ps1')
function Assert-Startup($Condition, $Message) { if (-not $Condition) { throw $Message } }
function New-TestAdapter {
    $script:startupTestState = @{ Missing = @(); Calls = [Collections.Generic.List[string]]::new(); Key = $true; FailInstall = $false; Repair = $true; SkipKey = $false; FailKey = $false }
    return @{
        Check = { param($name) $script:startupTestState.Calls.Add("check:$name"); return $name -notin $script:startupTestState.Missing }
        Install = { param($name) $script:startupTestState.Calls.Add("install:$name"); if ($script:startupTestState.FailInstall) { throw 'installer failed' }; if ($script:startupTestState.Repair) { $script:startupTestState.Missing = @($script:startupTestState.Missing | Where-Object { $_ -ne $name }) } }
        KeyConfigured = { return $script:startupTestState.Key }
        ConfigureKey = { $script:startupTestState.Calls.Add('key'); if ($script:startupTestState.FailKey) { throw 'key failed' }; $script:startupTestState.Key = -not $script:startupTestState.SkipKey }
        Launch = { $script:startupTestState.Calls.Add('launch') }
        Say = { param($message) }
    }
}
$adapter = New-TestAdapter
$result = Invoke-HarmoniaStartup -Adapter $adapter
Assert-Startup ($result.Ready -and $script:startupTestState.Calls[-1] -eq 'launch') 'Ready machine did not launch'
Assert-Startup (@($script:startupTestState.Calls | Where-Object { $_ -like 'install:*' -or $_ -eq 'key' }).Count -eq 0) 'Ready setup was unnecessarily changed'

$adapter = New-TestAdapter
$script:startupTestState.Missing = @('Node', 'Frontend', 'Recognition')
$result = Invoke-HarmoniaStartup -Adapter $adapter
Assert-Startup ((@($script:startupTestState.Calls | Where-Object { $_ -like 'install:*' }) -join ',') -eq 'install:Node,install:Frontend,install:Recognition') 'Missing dependencies installed out of order'
Assert-Startup ($result.Ready) 'Repaired setup not ready'

foreach ($failure in @('FailInstall','Repair')) {
    $adapter = New-TestAdapter
    $script:startupTestState.Missing = @('Node')
    $script:startupTestState[$failure] = ($failure -eq 'FailInstall')
    $caught = $false
    try { Invoke-HarmoniaStartup -Adapter $adapter | Out-Null } catch { $caught = $true }
    Assert-Startup $caught 'Failed setup did not stop'
    Assert-Startup ('launch' -notin $script:startupTestState.Calls) 'Launched after failed setup'
}

$adapter = New-TestAdapter
$script:startupTestState.Missing = @('Node','Recognition')
$script:startupTestState.Key = $false
$result = Invoke-HarmoniaStartup -Adapter $adapter -CheckOnly
Assert-Startup (-not $result.Ready -and $result.Missing.Count -eq 2) 'Check-only hid missing requirements'
Assert-Startup (@($script:startupTestState.Calls | Where-Object { $_ -notlike 'check:*' }).Count -eq 0) 'Check-only mutated or prompted'

$adapter = New-TestAdapter
$script:startupTestState.Missing = @('Acquisition')
$result = Invoke-HarmoniaStartup -Adapter $adapter -SetupOnly
Assert-Startup ($result.Ready -and 'launch' -notin $script:startupTestState.Calls) 'Setup-only launched'

$adapter = New-TestAdapter
$script:startupTestState.Key = $false
$result = Invoke-HarmoniaStartup -Adapter $adapter
Assert-Startup ($result.KeyConfigured -and 'key' -in $script:startupTestState.Calls) 'Missing key was not configured'

$adapter = New-TestAdapter
$script:startupTestState.Key = $false
$script:startupTestState.SkipKey = $true
$result = Invoke-HarmoniaStartup -Adapter $adapter
Assert-Startup ($result.Ready -and -not $result.KeyConfigured -and 'launch' -in $script:startupTestState.Calls) 'Skipping key prevented local-file mode'

$adapter = New-TestAdapter
$script:startupTestState.Key = $false
$result = Invoke-HarmoniaStartup -Adapter $adapter -NonInteractive
Assert-Startup ('key' -notin $script:startupTestState.Calls -and 'launch' -in $script:startupTestState.Calls) 'Noninteractive run prompted or blocked local mode'

$adapter = New-TestAdapter
$script:startupTestState.Key = $false
$script:startupTestState.FailKey = $true
$caught = $false
try { Invoke-HarmoniaStartup -Adapter $adapter | Out-Null } catch { $caught = $true }
Assert-Startup ($caught -and 'launch' -notin $script:startupTestState.Calls) 'Credential setup failure was hidden'
Write-Output 'Startup workflow: 10 scenarios passed (no installers, credentials or GUI used).'
