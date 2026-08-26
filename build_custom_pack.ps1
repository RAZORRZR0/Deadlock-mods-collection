<#
.SYNOPSIS
    Interactive Modular Custom Mod Builder for Deadlock Mods Collection.
    Allows selecting which mods to bundle into a single unified VPK package.
#>
param(
    [string]$Modules = "",
    [string]$PakName = "pak89_dir.vpk",
    [switch]$Install,
    [string]$AddonsPath = ""
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkEditCli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)

$addonsCandidates = @(
    "D:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",
    "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",
    "C:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\citadel\addons"
)
if (-not $AddonsPath) {
    $detected = $addonsCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($detected) {
        $AddonsPath = $detected
    } else {
        $AddonsPath = $addonsCandidates[0]
    }
}

# Python candidate lookup for abilities mods
$python = (Get-Command py.exe -ErrorAction SilentlyContinue).Source
if (-not $python) {
    $pythonCandidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Launcher\py.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
        "C:\Users\Administrator\AppData\Local\Programs\Python\Launcher\py.exe",
        "C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"
    )
    $python = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

function Remove-RootIncludeBlock {
    param([string]$InputPath)
    $content = Get-Content -LiteralPath $InputPath -Raw
    $includePattern = '(?ms)^\s*_include\s*=\s*\r?\n\s*\[\s*\r?\n(?:\s*resource_name:"[^"]+",?\s*\r?\n)+\s*\]\s*\r?\n'
    if ([regex]::IsMatch($content, $includePattern)) {
        $updated = [regex]::Replace($content, $includePattern, '', 1)
        [System.IO.File]::WriteAllText($InputPath, $updated, [System.Text.UTF8Encoding]::new($false))
    }
}

# Module registry
$availableModules = @(
    @{ Id = "showrank_qol";           Name = "ShowRank + Topbar QoL (Nicknames, Ult CD, Soul Diff) + Shop Purchases + Testing Tools"; Default = $true },
    @{ Id = "poker";                  Name = "ESC-Menu Table Games (Poker & Bluff Deck)";                                          Default = $true },
    @{ Id = "abilities_no_behavior";  Name = "Active & Passive Items in Passive Area (No Filter / Original Active Behavior)";     Default = $false },
    @{ Id = "abilities_yes_behavior"; Name = "Active & Passive Items with yesBehavior Filter";                                     Default = $false },
    @{ Id = "buff_timer";             Name = "Buff Timer & Rejuvenator HUD";                                                       Default = $false },
    @{ Id = "hud_3d";                 Name = "3D Hero Dynamic Models HUD";                                                         Default = $false }
)

$selected = @{}
foreach ($mod in $availableModules) {
    $selected[$mod.Id] = $mod.Default
}

# If modules passed via command line, parse them
if ($Modules) {
    foreach ($k in @($selected.Keys)) { $selected[$k] = $false }
    $parts = $Modules -split '[,; ]+'
    foreach ($p in $parts) {
        $clean = $p.Trim().ToLower()
        if ($clean -match '^(1|showrank|qol)')            { $selected["showrank_qol"] = $true }
        if ($clean -match '^(2|poker)')                    { $selected["poker"] = $true }
        if ($clean -match '^(3|active_no_filter|pak05)')  { $selected["abilities_no_behavior"] = $true }
        if ($clean -match '^(4|active_yes_filter|pak03)') { $selected["abilities_yes_behavior"] = $true }
        if ($clean -match '^(5|buff)')                     { $selected["buff_timer"] = $true }
        if ($clean -match '^(6|3d|hud_3d)')                { $selected["hud_3d"] = $true }
        if ($clean -eq 'all') { foreach ($k in @($selected.Keys)) { $selected[$k] = $true } }
    }
} else {
    # Interactive Menu loop
    while ($true) {
        Clear-Host
        Write-Host "=========================================================================" -ForegroundColor Cyan
        Write-Host "             DEADLOCK MODS COLLECTION - CUSTOM VPK BUILDER               " -ForegroundColor Yellow
        Write-Host "=========================================================================" -ForegroundColor Cyan
        Write-Host "Select which mods to package into a single unified VPK:`n"

        for ($i = 0; $i -lt $availableModules.Count; $i++) {
            $mod = $availableModules[$i]
            $status = if ($selected[$mod.Id]) { "[X] ENABLED " } else { "[ ] DISABLED" }
            $color = if ($selected[$mod.Id]) { "Green" } else { "DarkGray" }
            Write-Host "  $status " -NoNewline -ForegroundColor $color
            Write-Host "[$($i + 1)] $($mod.Name)" -ForegroundColor White
        }

        Write-Host "`n-------------------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host "Commands:" -ForegroundColor Cyan
        Write-Host "  Type numbers to select exactly those mods (e.g. '1 2' to enable #1 and #2)"
        Write-Host "  Type 't 1' or 'toggle 2' to toggle an individual mod"
        Write-Host "  Type 'all' to enable all, or 'none' to disable all"
        Write-Host "  Press ENTER to proceed with the current selection"
        Write-Host "  Type 'q' to exit"
        Write-Host "-------------------------------------------------------------------------" -ForegroundColor DarkGray
        $input = Read-Host "Choice"
        
        if (-not $input) { break }
        $inputStr = $input.Trim()
        if ($inputStr.ToLower() -eq 'q') { exit 0 }
        if ($inputStr.ToLower() -eq 'all') {
            foreach ($k in @($selected.Keys)) { $selected[$k] = $true }
            continue
        }
        if ($inputStr.ToLower() -eq 'none') {
            foreach ($k in @($selected.Keys)) { $selected[$k] = $false }
            continue
        }
        if ($inputStr.ToLower() -match '^(t|toggle)\s+') {
            $toks = ($inputStr -replace '^(t|toggle)\s+', '') -split '[,; ]+'
            foreach ($tok in $toks) {
                $num = 0
                if ([int]::TryParse($tok, [ref]$num) -and $num -ge 1 -and $num -le $availableModules.Count) {
                    $modId = $availableModules[$num - 1].Id
                    $selected[$modId] = -not $selected[$modId]
                }
            }
            continue
        }

        # Direct number selection: select specified numbers, disable the rest
        $tokens = $inputStr -split '[,; ]+'
        $validNums = @()
        foreach ($tok in $tokens) {
            $num = 0
            if ([int]::TryParse($tok, [ref]$num) -and $num -ge 1 -and $num -le $availableModules.Count) {
                $validNums += $num
            }
        }
        if ($validNums.Count -gt 0) {
            foreach ($k in @($selected.Keys)) { $selected[$k] = $false }
            foreach ($n in $validNums) {
                $modId = $availableModules[$n - 1].Id
                $selected[$modId] = $true
            }
        }
    }

    # Ask for pak slot if interactive
    Write-Host "`nTarget VPK Name [Default: $PakName]: " -NoNewline -ForegroundColor Yellow
    $customPak = Read-Host
    if ($customPak.Trim()) { $PakName = $customPak.Trim() }

    Write-Host "Install directly to Deadlock addons? (Y/N) [Default: Y]: " -NoNewline -ForegroundColor Yellow
    $ans = Read-Host
    if (-not $ans -or $ans.Trim().ToLower() -eq 'y') {
        $Install = $true
    }
}

$activeList = @($selected.Keys | Where-Object { $selected[$_] })
if ($activeList.Count -eq 0) {
    Write-Host "No modules selected. Aborting." -ForegroundColor Red
    exit 1
}

$buildRoot = Join-Path $root '_custom_pack_build'
$stageSource = Join-Path $buildRoot 'src'
$stageCompiled = Join-Path $buildRoot 'src_compiled'
$vpkOutput = Join-Path $root $PakName

Write-Host "`n[1/4] Assembling selected mod source assets..." -ForegroundColor Cyan
$modulesParam = ($activeList -join ',')
$mergerScript = Join-Path $root 'scripts\merge-custom-pack.mjs'

& node $mergerScript --stage $stageSource --modules $modulesParam
if ($LASTEXITCODE -ne 0) {
    throw "Source asset merge failed."
}
Write-Host "  Source assets assembled successfully in $stageSource" -ForegroundColor Green

Write-Host "`n[2/4] Compiling assets via Source 2 resourcecompiler..." -ForegroundColor Cyan
if (Test-Path -LiteralPath $stageCompiled) {
    Remove-Item -LiteralPath $stageCompiled -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stageCompiled | Out-Null

$sourceFiles = Get-ChildItem -LiteralPath $stageSource -Recurse -File | Where-Object { $_.Extension -match '\.(xml|css|js|vdata)$' }
$requiredOutputs = @($sourceFiles | ForEach-Object {
    $rel = $_.FullName.Substring($stageSource.Length).TrimStart('\', '/')
    $compiledRel = $rel -replace '\.xml$', '.vxml_c' -replace '\.css$', '.vcss_c' -replace '\.js$', '.vjs_c' -replace '\.vdata$', '.vdata_c'
    Join-Path $stageCompiled $compiledRel
})

Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs $requiredOutputs -TimeoutSeconds 180
Write-Host "  Compilation completed ($($requiredOutputs.Count) assets)." -ForegroundColor Green

# If Poker is enabled, ensure card & chip compiled textures are copied to compiled stage
if ($selected["poker"]) {
    $pokerCardsSrc = Join-Path $root 'poker\panorama\images\poker\cards'
    $pokerChipsSrc = Join-Path $root 'poker\panorama\images\poker\chips'
    $stageCardsOut = Join-Path $stageCompiled 'panorama\images\poker\cards'
    $stageChipsOut = Join-Path $stageCompiled 'panorama\images\poker\chips'

    New-Item -ItemType Directory -Force -Path $stageCardsOut | Out-Null
    New-Item -ItemType Directory -Force -Path $stageChipsOut | Out-Null

    if (Test-Path -LiteralPath $pokerCardsSrc) {
        Get-ChildItem -LiteralPath $pokerCardsSrc -Filter '*.vtex_c' | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $stageCardsOut -Force
        }
    }
    if (Test-Path -LiteralPath $pokerChipsSrc) {
        Get-ChildItem -LiteralPath $pokerChipsSrc -Filter '*.vtex_c' | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $stageChipsOut -Force
        }
    }
}

Write-Host "`n[3/4] Packing VPK: $vpkOutput..." -ForegroundColor Cyan
if (Test-Path -LiteralPath $vpkOutput) {
    Remove-Item -LiteralPath $vpkOutput -Force
}

Invoke-VpkPack -VpkEditCli $vpkEditCli -InputDir $stageCompiled -OutputPath $vpkOutput
$vpkSize = (Get-Item $vpkOutput).Length
Write-Host "SUCCESS: Built $vpkOutput ($([Math]::Round($vpkSize / 1KB, 2)) KB)" -ForegroundColor Green

if ($Install) {
    Write-Host "`n[4/4] Deploying to Deadlock addons: $AddonsPath\$PakName..." -ForegroundColor Cyan
    $deadlockProcesses = Get-Process -Name 'deadlock' -ErrorAction SilentlyContinue
    if ($deadlockProcesses) {
        Write-Host "WARNING: Deadlock is currently running. Please close Deadlock and copy $PakName to $AddonsPath manually." -ForegroundColor Yellow
    } else {
        if (-not (Test-Path -LiteralPath $AddonsPath)) {
            New-Item -ItemType Directory -Force -Path $AddonsPath | Out-Null
        }
        $destPath = Join-Path $AddonsPath $PakName
        Copy-Item -LiteralPath $vpkOutput -Destination $destPath -Force
        Write-Host "Installed successfully to $destPath" -ForegroundColor Green
    }
}

Write-Host "`nDone! Your custom Deadlock collection is ready." -ForegroundColor Cyan
