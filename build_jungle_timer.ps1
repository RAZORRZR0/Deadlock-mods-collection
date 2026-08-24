param(
    [switch]$Install,
    [string]$AddonsPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",
    [string]$PakName = "pak98_dir.vpk"
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$modSrc = Join-Path $root 'jungle_timer'
$modCompiled = Join-Path $root 'jungle_timer_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkOut = Join-Path $root $PakName
$compiledCheck = Join-Path $modCompiled 'panorama\scripts\jungle_timer.vjs_c'

if (Test-Path -LiteralPath $modCompiled) { Remove-Item -LiteralPath $modCompiled -Recurse -Force }
if (Test-Path -LiteralPath $vpkOut) { Remove-Item -LiteralPath $vpkOut -Force }

Write-Host "`n[1/3] Compiling jungle_timer..." -ForegroundColor Cyan
Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $modSrc -RequiredOutputs @($compiledCheck)
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

Write-Host "`n[2/3] Packing VPK..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$vpkSize = (Get-Item $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize/1KB, 1)) KB)" -ForegroundColor Green

if ($Install) {
    Write-Host "`n[3/3] Deploying to Deadlock addons..." -ForegroundColor Cyan
    $deadlockProcesses = Get-Process -Name 'deadlock' -ErrorAction SilentlyContinue
    if ($deadlockProcesses) {
        throw "Cannot install while Deadlock is running. Please close Deadlock and re-run with -Install."
    }
    if (-not (Test-Path -LiteralPath $AddonsPath)) {
        New-Item -ItemType Directory -Force -Path $AddonsPath | Out-Null
    }
    $targetVpk = Join-Path $AddonsPath $PakName
    Copy-Item -LiteralPath $vpkOut -Destination $targetVpk -Force
    Write-Host "  Deployed -> $targetVpk" -ForegroundColor Green
}
