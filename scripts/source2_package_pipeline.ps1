function Get-RepoToolPath {
    param(
        [Parameter(Mandatory=$true)][string[]]$Candidates,
        [Parameter(Mandatory=$true)][string]$ToolName
    )

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }

    if ($ToolName -eq 'vpkeditcli.exe') {
        $pathCmd = Get-Command 'vpkeditcli.exe' -ErrorAction SilentlyContinue
        if ($pathCmd) { return $pathCmd.Source }
        return 'node-vpk-packer'
    }

    throw "$ToolName not found. Checked: $($Candidates -join ', ')"
}

function Assert-PathUnderRoot {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string]$RootPath
    )

    $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $resolvedRoot = [System.IO.Path]::GetFullPath($RootPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $rootPrefix = $resolvedRoot + [System.IO.Path]::DirectorySeparatorChar
    $altRootPrefix = $resolvedRoot + [System.IO.Path]::AltDirectorySeparatorChar

    if ($resolvedPath.Equals($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        (-not $resolvedPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
         -not $resolvedPath.StartsWith($altRootPrefix, [System.StringComparison]::OrdinalIgnoreCase))) {
        throw "Refusing to operate outside root. Path=$resolvedPath Root=$resolvedRoot"
    }
}

function Remove-TreeUnderRoot {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string]$RootPath,
        [string]$ExpectedLeaf = ""
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }
    Assert-PathUnderRoot -Path $Path -RootPath $RootPath
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    if ($ExpectedLeaf -and (Split-Path -Leaf $resolvedPath) -ne $ExpectedLeaf) {
        throw "Refusing to remove unexpected path: $resolvedPath"
    }
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

function Find-ResourceCompiler {
    $candidates = @(
        'D:\CSDK12\Reduced_CSDK_12\Reduced_CSDK_12',
        'E:\SteamLibrary\steamapps\common\dota 2 beta',
        'G:\SteamLibrary\steamapps\common\Deadlock',
        'D:\SteamLibrary\steamapps\common\Deadlock'
    )

    $prefPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'sr2compiler\pref.json'
    if (Test-Path -LiteralPath $prefPath) {
        try {
            $pref = Get-Content -LiteralPath $prefPath -Raw | ConvertFrom-Json
            if ($pref.directory -and (Test-Path -LiteralPath $pref.directory)) {
                $candidates = @($pref.directory) + $candidates
            }
        } catch {}
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            $rcPaths = @(
                (Join-Path $candidate 'game\bin_cs2\win64\resourcecompiler.exe'),
                (Join-Path $candidate 'game\bin\win64\resourcecompiler.exe'),
                (Join-Path $candidate 'game\bin_tools\win64\resourcecompiler.exe')
            )
            foreach ($rc in $rcPaths) {
                if (Test-Path -LiteralPath $rc) {
                    $gameDir = Join-Path $candidate 'game\citadel'
                    if (-not (Test-Path -LiteralPath (Join-Path $gameDir 'gameinfo.gi'))) {
                        $gameDir = Join-Path $candidate 'game\dota'
                    }
                    return @{
                        SdkRoot = $candidate
                        Compiler = $rc
                        GameDir = $gameDir
                    }
                }
            }
        }
    }
    return $null
}

function Invoke-Source2Compiler {
    param(
        [Parameter(Mandatory=$true)][string]$CompilerPath,
        [Parameter(Mandatory=$true)][string]$SourceDir,
        [Parameter(Mandatory=$true)][string[]]$RequiredOutputs,
        [int]$TimeoutSeconds = 120,
        [switch]$HiddenWindow
    )

    # First check if we have direct access to resourcecompiler.exe
    $rcInfo = Find-ResourceCompiler
    if ($rcInfo) {
        $addonId = 'stage_' + [System.Guid]::NewGuid().ToString('N').Substring(0, 8)
        $contentAddon = Join-Path $rcInfo.SdkRoot "content\citadel_addons\$addonId"
        $gameAddon = Join-Path $rcInfo.SdkRoot "game\citadel_addons\$addonId"

        try {
            New-Item -ItemType Directory -Force -Path $contentAddon | Out-Null
            # If SourceDir has panorama/ directly or is panorama itself
            if (Test-Path -LiteralPath (Join-Path $SourceDir 'panorama')) {
                Copy-Item -Path (Join-Path $SourceDir 'panorama') -Destination $contentAddon -Recurse -Force
            } elseif ((Split-Path -Leaf $SourceDir) -eq 'panorama') {
                Copy-Item -Path $SourceDir -Destination $contentAddon -Recurse -Force
            } else {
                Copy-Item -Path (Join-Path $SourceDir '*') -Destination $contentAddon -Recurse -Force
            }

            $compilePattern = Join-Path $contentAddon '*.*'
            $rcProc = Start-Process -FilePath $rcInfo.Compiler -ArgumentList "-game `"$($rcInfo.GameDir)`" -f -r -i `"$compilePattern`"" -PassThru -NoNewWindow -Wait

            if (Test-Path -LiteralPath $gameAddon) {
                # Determine destination compiled directory from RequiredOutputs
                if ($RequiredOutputs.Count -gt 0) {
                    $firstOutput = $RequiredOutputs[0]
                    # Find root compiled folder that contains panorama/ or scripts/
                    $stageCompiledDir = $null
                    $curr = Split-Path -Parent $firstOutput
                    while ($curr -and -not $stageCompiledDir) {
                        $leaf = Split-Path -Leaf $curr
                        if ($leaf -match '^(src_compiled|.*_compiled)$') {
                            $stageCompiledDir = $curr
                            break
                        }
                        $parent = Split-Path -Parent $curr
                        if ($parent -eq $curr) { break }
                        $curr = $parent
                    }

                    if ($stageCompiledDir) {
                        if (-not (Test-Path -LiteralPath $stageCompiledDir)) {
                            New-Item -ItemType Directory -Force -Path $stageCompiledDir | Out-Null
                        }
                        Copy-Item -Path (Join-Path $gameAddon '*') -Destination $stageCompiledDir -Recurse -Force
                    }
                }
            }
        } finally {
            if (Test-Path -LiteralPath $contentAddon) { Remove-Item -LiteralPath $contentAddon -Recurse -Force -ErrorAction SilentlyContinue }
            if (Test-Path -LiteralPath $gameAddon) { Remove-Item -LiteralPath $gameAddon -Recurse -Force -ErrorAction SilentlyContinue }
        }

        # Check if all required outputs now exist
        $missingOutputs = @($RequiredOutputs | Where-Object { -not (Test-Path -LiteralPath $_) })
        if ($missingOutputs.Count -eq 0) {
            return
        }
    }

    # Fall back to wrapper process execution
    if ($CompilerPath -and (Test-Path -LiteralPath $CompilerPath)) {
        $startProcessArgs = @{
            FilePath = $CompilerPath
            ArgumentList = "`"$SourceDir`""
            PassThru = $true
        }
        if ($HiddenWindow) { $startProcessArgs.WindowStyle = 'Hidden' }
        $proc = Start-Process @startProcessArgs
        $compileDeadline = (Get-Date).AddSeconds($TimeoutSeconds)

        while (-not $proc.HasExited -and (Get-Date) -lt $compileDeadline) {
            Start-Sleep -Milliseconds 500
            $allRequiredOutputsExist = $true
            foreach ($requiredOutput in $RequiredOutputs) {
                if (-not (Test-Path -LiteralPath $requiredOutput)) {
                    $allRequiredOutputsExist = $false
                    break
                }
            }
            if ($allRequiredOutputsExist) {
                Start-Sleep -Seconds 2
                if (-not $proc.HasExited) {
                    Write-Host "[WARN] Compiler produced output but did not exit; stopping wrapper." -ForegroundColor Yellow
                    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                    $proc.WaitForExit()
                }
                break
            }
        }

        if (-not $proc.HasExited) {
            Write-Host "[WARN] Compiler timed out; stopping wrapper." -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            $proc.WaitForExit()
        }
    }

    $missingOutputs = @($RequiredOutputs | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($missingOutputs.Count -gt 0) {
        throw "Compiler did not create required output: $($missingOutputs -join ', ')"
    }
}

function Invoke-VpkPack {
    param(
        [Parameter(Mandatory=$false)][string]$VpkEditCli,
        [Parameter(Mandatory=$true)][string]$InputDir,
        [Parameter(Mandatory=$true)][string]$OutputPath
    )

    if ($VpkEditCli -and $VpkEditCli -ne 'node-vpk-packer' -and (Test-Path -LiteralPath $VpkEditCli)) {
        $packOutput = & $VpkEditCli $InputDir -o $OutputPath -s --no-progress 2>&1
        $exitCode = $LASTEXITCODE
        if ($packOutput) {
            $packOutput | ForEach-Object { Write-Host $_ }
        }
        if ($exitCode -ne 0) {
            throw "vpkeditcli failed with exit code $exitCode"
        }
    } else {
        $packVpkScript = Join-Path $PSScriptRoot 'pack_vpk.mjs'
        if (-not (Test-Path -LiteralPath $packVpkScript)) {
            throw "Neither vpkeditcli nor pack_vpk.mjs was found."
        }
        $nodeOutput = & node $packVpkScript $InputDir $OutputPath 2>&1
        $exitCode = $LASTEXITCODE
        if ($nodeOutput) {
            $nodeOutput | ForEach-Object { Write-Host $_ }
        }
        if ($exitCode -ne 0) {
            throw "node pack_vpk.mjs failed with exit code $exitCode"
        }
    }

    if (-not (Test-Path -LiteralPath $OutputPath)) {
        throw "VPK not created: $OutputPath"
    }
}

function Get-PackedVpkTree {
    param(
        [Parameter(Mandatory=$false)][string]$VpkEditCli,
        [Parameter(Mandatory=$true)][string]$VpkPath,
        [string]$Source2ViewerPath = ""
    )

    if ($Source2ViewerPath -and (Test-Path -LiteralPath $Source2ViewerPath)) {
        $tree = & $Source2ViewerPath -i $VpkPath --vpk_list
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) { throw "Source2Viewer failed to inspect VPK with exit code $exitCode" }
        return [string[]]$tree
    }

    if ($VpkEditCli -and $VpkEditCli -ne 'node-vpk-packer' -and (Test-Path -LiteralPath $VpkEditCli)) {
        $tree = & $VpkEditCli $VpkPath --file-tree --no-progress
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) { throw "vpkeditcli failed to inspect VPK with exit code $exitCode" }
        return [string[]]$tree
    }

    $inspectScript = Join-Path $PSScriptRoot 'inspect_vpk.mjs'
    if (Test-Path -LiteralPath $inspectScript) {
        $tree = & node $inspectScript $VpkPath
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) { throw "inspect_vpk.mjs failed to inspect VPK with exit code $exitCode" }
        return [string[]]$tree
    }

    throw "No VPK inspector available (neither Source2Viewer, vpkeditcli, nor inspect_vpk.mjs)."
}

function Test-PackedAsset {
    param(
        [Parameter(Mandatory=$true)][string[]]$Tree,
        [Parameter(Mandatory=$true)][string]$Asset
    )

    $leaf = Split-Path -Leaf $Asset
    return (($Tree | Select-String -SimpleMatch $Asset -Quiet) -or
        ($leaf -and ($Tree | Select-String -SimpleMatch $leaf -Quiet)))
}

function Assert-PackedVpkAssets {
    param(
        [Parameter(Mandatory=$true)][string[]]$Tree,
        [string[]]$Required = @(),
        [string[]]$Forbidden = @(),
        [string]$Label = "VPK"
    )

    foreach ($asset in $Required) {
        if (-not (Test-PackedAsset -Tree $Tree -Asset $asset)) {
            throw "$Label missing required asset: $asset"
        }
    }
    foreach ($asset in $Forbidden) {
        if (Test-PackedAsset -Tree $Tree -Asset $asset) {
            throw "$Label contains forbidden asset: $asset"
        }
    }
}

function Compress-Vpk7Zip {
    param(
        [Parameter(Mandatory=$true)][string]$SevenZip,
        [Parameter(Mandatory=$true)][string]$InputPath,
        [Parameter(Mandatory=$true)][string]$ArchivePath,
        [string]$ExpectedLeaf = ""
    )

    & $SevenZip a -t7z $ArchivePath $InputPath | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ArchivePath)) {
        throw "7z failed for $ArchivePath"
    }
    if ($ExpectedLeaf) {
        $listing = & $SevenZip l $ArchivePath
        if ($LASTEXITCODE -ne 0) {
            throw "7z failed to list $ArchivePath"
        }
        if (-not ($listing | Select-String -SimpleMatch $ExpectedLeaf -Quiet)) {
            throw "7z archive missing expected file: $ExpectedLeaf"
        }
    }
}
