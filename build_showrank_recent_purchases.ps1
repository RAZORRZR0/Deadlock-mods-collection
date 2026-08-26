param(
    [switch]$Install,
    [switch]$KeepStaging,
    [string]$AddonsPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",
    [string]$PakName = "pak89_dir.vpk"
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$addonsCandidates = @(
    "D:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",
    "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",
    "C:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\citadel\addons"
)
if (-not $PSBoundParameters.ContainsKey('AddonsPath')) {
    $detected = $addonsCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($detected) {
        $AddonsPath = $detected
    }
}

$projectRoot = Join-Path $root 'showrank_recent_purchases'
$buildRoot = Join-Path $root '_showrank_recent_purchases_build'
$stageSource = Join-Path $buildRoot 'src'
$stageCompiled = Join-Path $buildRoot 'src_compiled'
$vpkOutput = Join-Path $root 'showrank_recent_purchases_dir.vpk'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkEditCli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)

$requiredSourceAssets = @(
    'panorama/layout/citadel_db_page_profile.xml',
    'panorama/layout/citadel_hud_hero_shop.xml',
    'panorama/layout/citadel_hud_top_bar.xml',
    'panorama/layout/citadel_hud_top_bar_player.xml',
    'panorama/layout/citadel_ui_context_menu_player.xml',
    'panorama/layout/hud_escape_menu.xml',
    'panorama/layout/hud_hero_testing.xml',
    'panorama/layout/players_list_entry.xml',
    'panorama/layout/profile_card.xml',
    'panorama/scripts/hud_hero_testing.js',
    'panorama/scripts/recent_purchases_redux.js',
    'panorama/scripts/recent_purchases_redux_data.js',
    'panorama/scripts/showrank_barebones.js',
    'panorama/styles/base/citadel_hud_hero_shop.css',
    'panorama/styles/base/citadel_hud_top_bar.css',
    'panorama/styles/citadel_hud_hero_shop.css',
    'panorama/styles/citadel_hud_top_bar.css',
    'panorama/styles/hero_testing_menu.css',
    'panorama/styles/hud_damage_report.css',
    'panorama/styles/showrank_barebones_topbar.css'
)

$requiredCompiledAssets = @(
    'panorama/layout/citadel_db_page_profile.vxml_c',
    'panorama/layout/citadel_hud_hero_shop.vxml_c',
    'panorama/layout/citadel_hud_top_bar.vxml_c',
    'panorama/layout/citadel_hud_top_bar_player.vxml_c',
    'panorama/layout/citadel_ui_context_menu_player.vxml_c',
    'panorama/layout/hud_escape_menu.vxml_c',
    'panorama/layout/hud_hero_testing.vxml_c',
    'panorama/layout/players_list_entry.vxml_c',
    'panorama/layout/profile_card.vxml_c',
    'panorama/scripts/hud_hero_testing.vjs_c',
    'panorama/scripts/recent_purchases_redux.vjs_c',
    'panorama/scripts/recent_purchases_redux_data.vjs_c',
    'panorama/scripts/showrank_barebones.vjs_c',
    'panorama/styles/base/citadel_hud_hero_shop.vcss_c',
    'panorama/styles/base/citadel_hud_top_bar.vcss_c',
    'panorama/styles/citadel_hud_hero_shop.vcss_c',
    'panorama/styles/citadel_hud_top_bar.vcss_c',
    'panorama/styles/hero_testing_menu.vcss_c',
    'panorama/styles/hud_damage_report.vcss_c',
    'panorama/styles/showrank_barebones_topbar.vcss_c'
)

function Assert-AssetSet {
    param(
        [Parameter(Mandatory = $true)][string[]]$Actual,
        [Parameter(Mandatory = $true)][string[]]$ExpectedAssets,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $expected = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($asset in $ExpectedAssets) {
        if (-not $expected.Add($asset)) { throw "$Label required asset is duplicated: $asset" }
    }

    $actualSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $duplicates = [System.Collections.Generic.List[string]]::new()
    foreach ($asset in $Actual) {
        if (-not $actualSet.Add($asset)) { $duplicates.Add($asset) }
    }

    $missing = [System.Collections.Generic.List[string]]::new()
    foreach ($asset in $expected) {
        if (-not $actualSet.Contains($asset)) { $missing.Add($asset) }
    }

    $unexpected = [System.Collections.Generic.List[string]]::new()
    foreach ($asset in $actualSet) {
        if (-not $expected.Contains($asset)) { $unexpected.Add($asset) }
    }

    if ($duplicates.Count -or $missing.Count -or $unexpected.Count) {
        throw "$Label asset set mismatch. Missing=[$($missing -join ', ')]; Unexpected=[$($unexpected -join ', ')]; Duplicates=[$($duplicates -join ', ')]"
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

try {
    Write-Host "=== Building ShowRank + ByteNode Recent Purchases ===" -ForegroundColor Cyan

    $sourcePaths = Get-FolderAssetPaths -RootPath $projectRoot
    Assert-AssetSet -Actual $sourcePaths -ExpectedAssets $requiredSourceAssets -Label 'Source inventory'
    Write-Host "Source asset verification passed ($($sourcePaths.Count) assets)" -ForegroundColor Green

    Remove-TreeUnderRoot -Path $buildRoot -RootPath $root
    New-Item -ItemType Directory -Force -Path $stageSource | Out-Null
    Copy-Item -Path (Join-Path $projectRoot 'panorama') -Destination $stageSource -Recurse -Force

    $requiredOutputPaths = @($requiredCompiledAssets | ForEach-Object { Join-Path $stageCompiled $_ })

    Write-Host "Compiling Panorama assets via Source 2 resourcecompiler..." -ForegroundColor Cyan
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs $requiredOutputPaths

    $compiledPaths = Get-FolderAssetPaths -RootPath $stageCompiled
    Assert-AssetSet -Actual $compiledPaths -ExpectedAssets $requiredCompiledAssets -Label 'Compiled output'
    Write-Host "Compiled asset verification passed ($($compiledPaths.Count) compiled assets)" -ForegroundColor Green

    if (Test-Path -LiteralPath $vpkOutput) {
        Remove-Item -LiteralPath $vpkOutput -Force
    }

    Write-Host "Packing VPK: $vpkOutput..." -ForegroundColor Cyan
    Invoke-VpkPack -VpkEditCli $vpkEditCli -InputDir $stageCompiled -OutputPath $vpkOutput

    $packedTree = Get-PackedVpkTree -VpkEditCli $vpkEditCli -VpkPath $vpkOutput
    Assert-PackedVpkAssets -Tree $packedTree -Required $requiredCompiledAssets -Label 'VPK archive'
    Write-Host "VPK archive verification passed" -ForegroundColor Green

    $vpkSize = (Get-Item $vpkOutput).Length
    Write-Host "SUCCESS: Built $vpkOutput ($([Math]::Round($vpkSize / 1KB, 2)) KB)" -ForegroundColor Green

    if ($Install) {
        $deadlockProcesses = Get-Process -Name 'deadlock' -ErrorAction SilentlyContinue
        if ($deadlockProcesses) {
            throw "Cannot install while Deadlock is running. Please close Deadlock and re-run with -Install."
        }
        if (-not (Test-Path -LiteralPath $AddonsPath)) {
            New-Item -ItemType Directory -Force -Path $AddonsPath | Out-Null
        }
        $targetVpk = Join-Path $AddonsPath $PakName
        Copy-Item -LiteralPath $vpkOutput -Destination $targetVpk -Force
        Write-Host "INSTALLED to: $targetVpk" -ForegroundColor Green
    }
}
finally {
    if (-not $KeepStaging -and (Test-Path -LiteralPath $buildRoot)) {
        Remove-TreeUnderRoot -Path $buildRoot -RootPath $root
    }
}
