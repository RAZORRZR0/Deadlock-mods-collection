param(
    [switch]$Install,
    [string]$AddonsPath = "D:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",
    [string]$PakName = "pak90_dir.vpk"
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$projectRoot = Join-Path $root 'testing_tools'
$buildRoot = Join-Path $root '_testing_tools_build'
$stageSource = Join-Path $buildRoot 'src'
$stageCompiled = Join-Path $buildRoot 'src_compiled'
$vpkOutput = Join-Path $root 'testing_tools_dir.vpk'
$vpkInstallDest = "$AddonsPath\$PakName"

$compiler = Join-Path $root 'sr2compiler\New folder.exe'

$vpkToolCandidates = @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)

$requiredSourceAssets = @(
    'panorama/layout/hud_hero_testing.xml',
    'panorama/scripts/hud_hero_testing.js',
    'panorama/styles/hero_testing_menu.css'
)

$requiredCompiledAssets = @(
    'panorama/layout/hud_hero_testing.vxml_c',
    'panorama/scripts/hud_hero_testing.vjs_c',
    'panorama/styles/hero_testing_menu.vcss_c'
)

function Assert-AssetSet {
    param(
        [Parameter(Mandatory = $true)][string[]]$Actual,
        [Parameter(Mandatory = $true)][string[]]$ExpectedAssets,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $expected = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($item in $ExpectedAssets) { [void]$expected.Add($item) }

    $missing = @()
    foreach ($item in $ExpectedAssets) {
        if ($Actual -notcontains $item) { $missing += $item }
    }

    $extra = @()
    foreach ($item in $Actual) {
        if (-not $expected.Contains($item)) { $extra += $item }
    }

    if ($missing.Count -gt 0 -or $extra.Count -gt 0) {
        $msg = "$Label assertion failed."
        if ($missing.Count -gt 0) { $msg += "`nMissing assets: $($missing -join ', ')" }
        if ($extra.Count -gt 0) { $msg += "`nUnexpected assets: $($extra -join ', ')" }
        throw $msg
    }
}

function Get-FolderAssetPaths {
    param([Parameter(Mandatory = $true)][string]$RootPath)

    $resolvedRoot = (Resolve-Path -LiteralPath $RootPath).Path.TrimEnd('\', '/')
    $panoramaRoot = Join-Path $resolvedRoot 'panorama'
    if (-not (Test-Path -LiteralPath $panoramaRoot)) {
        throw "Panorama source folder not found: $panoramaRoot"
    }
    return @(
        Get-ChildItem -LiteralPath $panoramaRoot -Recurse -File |
            ForEach-Object {
                $_.FullName.Substring($resolvedRoot.Length).TrimStart('\', '/') -replace '\\', '/'
            } |
            Sort-Object
    )
}

function Get-CompiledAssetPaths {
    param([Parameter(Mandatory = $true)][string]$CompiledRoot)

    $resolvedRoot = (Resolve-Path -LiteralPath $CompiledRoot).Path.TrimEnd('\', '/')
    $panoramaRoot = Join-Path $resolvedRoot 'panorama'
    if (-not (Test-Path -LiteralPath $panoramaRoot)) {
        throw "Compiled panorama folder not found: $panoramaRoot"
    }
    return @(
        Get-ChildItem -LiteralPath $panoramaRoot -Recurse -File |
            ForEach-Object {
                $_.FullName.Substring($resolvedRoot.Length).TrimStart('\', '/') -replace '\\', '/'
            } |
            Sort-Object
    )
}

try {
    Write-Host "=== Building Developer Testing Tools HUD Mod ===" -ForegroundColor Cyan

    $sourcePaths = Get-FolderAssetPaths -RootPath $projectRoot
    Assert-AssetSet -Actual $sourcePaths -ExpectedAssets $requiredSourceAssets -Label 'Source inventory'
    Write-Host "Source asset verification passed ($($sourcePaths.Count) assets)" -ForegroundColor Green

    Remove-TreeUnderRoot -Path $buildRoot -RootPath $root
    New-Item -ItemType Directory -Force -Path $stageSource | Out-Null
    Copy-Item -Path (Join-Path $projectRoot 'panorama') -Destination $stageSource -Recurse -Force

    $requiredOutputPaths = @($requiredCompiledAssets | ForEach-Object { Join-Path $stageCompiled $_ })

    Write-Host "Compiling Panorama assets via Source 2 resourcecompiler..." -ForegroundColor Cyan
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs $requiredOutputPaths

    $compiledPaths = Get-CompiledAssetPaths -CompiledRoot $stageCompiled
    Assert-AssetSet -Actual $compiledPaths -ExpectedAssets $requiredCompiledAssets -Label 'Compiled inventory'
    Write-Host "Compiled asset verification passed ($($compiledPaths.Count) compiled assets)" -ForegroundColor Green

    Write-Host "Packing VPK: $vpkOutput..." -ForegroundColor Cyan
    if (Test-Path -LiteralPath $vpkOutput) { Remove-Item -LiteralPath $vpkOutput -Force }

    $vpkTool = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates $vpkToolCandidates -ErrorAction SilentlyContinue
    Invoke-VpkPack -VpkEditCli $vpkTool -InputDir $stageCompiled -OutputPath $vpkOutput

    $tree = Get-PackedVpkTree -VpkEditCli $vpkTool -VpkPath $vpkOutput
    Assert-AssetSet -Actual $tree -ExpectedAssets $requiredCompiledAssets -Label 'VPK inventory'
    Write-Host "VPK archive verification passed" -ForegroundColor Green

    $vpkSize = (Get-Item -LiteralPath $vpkOutput).Length
    Write-Host "SUCCESS: Built $vpkOutput ($([math]::Round($vpkSize / 1KB, 2)) KB)" -ForegroundColor Green

    if ($Install) {
        Write-Host "`nDeploying to Deadlock addons: $vpkInstallDest..." -ForegroundColor Cyan
        $deadlockProcesses = Get-Process -Name 'deadlock' -ErrorAction SilentlyContinue
        if ($deadlockProcesses) {
            throw "Cannot install while Deadlock is running. Please close Deadlock and re-run with -Install."
        }
        $destDir = Split-Path $vpkInstallDest -Parent
        if (-not (Test-Path -LiteralPath $destDir)) {
            New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        }
        Copy-Item -LiteralPath $vpkOutput -Destination $vpkInstallDest -Force
        Write-Host "Deployed OK -> $vpkInstallDest" -ForegroundColor Green
    }
} finally {
    Remove-TreeUnderRoot -Path $buildRoot -RootPath $root
}
