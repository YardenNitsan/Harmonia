# Side-effect boundaries are injected so startup can be tested without installations.
function Invoke-HarmoniaStartup {
    param([hashtable]$Adapter, [switch]$CheckOnly, [switch]$SetupOnly, [switch]$NonInteractive)
    $missing = [Collections.Generic.List[string]]::new()
    foreach ($name in @('Node', 'Cpp', 'Rust', 'WebView', 'Python', 'Frontend', 'Recognition', 'Acquisition')) {
        & $Adapter.Say "Checking $name..."
        if (-not (& $Adapter.Check $name)) {
            if ($CheckOnly) { $missing.Add($name); continue }
            & $Adapter.Say "Setting up $name..."
            & $Adapter.Install $name
            if (-not (& $Adapter.Check $name)) {
                throw "$name is still unavailable. Restart Windows if an installer requested it, then run this command again. See README troubleshooting."
            }
        }
    }
    $key = [bool](& $Adapter.KeyConfigured)
    if (-not $key -and -not $CheckOnly -and -not $NonInteractive) {
        & $Adapter.ConfigureKey
        $key = [bool](& $Adapter.KeyConfigured)
    }
    if (-not $key) { & $Adapter.Say 'YouTube search is not configured. Local-file analysis remains available.' }
    $ready = $missing.Count -eq 0
    if ($ready -and -not $CheckOnly -and -not $SetupOnly) { & $Adapter.Launch }
    return [pscustomobject]@{ Ready = $ready; Missing = @($missing.ToArray()); KeyConfigured = $key }
}
