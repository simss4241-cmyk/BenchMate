param(
    [switch]$NoBrowser,
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$benchUrl = 'http://localhost:4317'
$benchProbeUrl = 'http://127.0.0.1:4317/api/health'
function Test-BenchMateReady {
    $benchResponse = Invoke-RestMethod $benchProbeUrl -TimeoutSec 2 -ErrorAction Stop
    return ($benchResponse.app -eq 'benchmate' -and $benchResponse.status -eq 'ready')
}
try {
    if (Test-BenchMateReady) {
        Write-Host "BenchMate is already running at $benchUrl"
        if (-not $NoBrowser -and -not $VerifyOnly) { Start-Process $benchUrl }
        exit 0
    }
} catch { }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Host 'Installing dependencies...'
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Host 'Building BenchMate...'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$env:PORT = '4317'
$benchServer = Start-Process -FilePath 'node.exe' -ArgumentList 'server/index.mjs','--production' -WorkingDirectory $PSScriptRoot -NoNewWindow -PassThru
try {
    $benchReady = $false
    $benchDeadline = [DateTime]::UtcNow.AddSeconds(30)
    $benchLastProbeError = 'No healthy response received.'
    while ([DateTime]::UtcNow -lt $benchDeadline) {
        $benchServer.Refresh()
        if ($benchServer.HasExited) { throw 'BenchMate exited before it was ready.' }
        try {
            if (Test-BenchMateReady) { $benchReady = $true; break }
            $benchLastProbeError = 'The response did not identify a ready BenchMate server.'
        } catch { $benchLastProbeError = $_.Exception.Message }
        Start-Sleep -Milliseconds 250
    }
    if (-not $benchReady) { throw "BenchMate did not become ready at $benchProbeUrl. $benchLastProbeError" }
    Write-Host "BenchMate readiness verified at $benchProbeUrl"
    if ($VerifyOnly) { exit 0 }
    if (-not $NoBrowser) { Start-Process $benchUrl }
    Write-Host 'Keep this window open. Close it or press Ctrl+C to stop BenchMate.'
    $benchServer.WaitForExit()
} finally {
    if (-not $benchServer.HasExited) { Stop-Process -Id $benchServer.Id }
}
