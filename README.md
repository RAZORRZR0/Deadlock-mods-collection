# Deadlock Mods Collection

![Status](https://img.shields.io/badge/Status-Experimental-orange)
![Game](https://img.shields.io/badge/Game-Deadlock-red)
![Platform](https://img.shields.io/badge/Platform-Windows-blue)

Source for a set of Panorama HUD/UI mods for Valve's _Deadlock_, plus a builder that merges the ones you pick into a single **all-in-one (AIO) VPK**. Most modules override stock Panorama layouts, styles and scripts; the abilities module transforms `abilities.vdata`.

This is a fork of [Hantu-Raya/Deadlock-mods-collection](https://github.com/Hantu-Raya/Deadlock-mods-collection) with local additions (see [Credits](#credits-and-upstream)).

## What is in the AIO pack

`build_custom_pack.bat` stages the selected modules, compiles them with the Source 2 resource compiler and packs one `pak01_dir.vpk`.

| Module id | Default | What it adds |
| --- | :---: | --- |
| `showrank_qol` | yes | ShowRank rank badges (top bar, team averages, profile, context menu, ESC player list, post-game scoreboard), profile **rank history** graph, **party stacks** (duo/trio icons), MISSING lane alerts, VS COMMUNITY stats on profiles, **Recent Purchases** (shop history + floating top bar purchase popups), Hero Testing / Hideout tools, spawn announcements, soul difference, ult cooldown text, always-visible nicknames, Buff/Rift minimap timers |
| `hp_colors_v3` | yes | HP Colors v3: custom health bar colors, timers HUD, world settings, in-game ESC editor |
| `abilities_yes_behavior` | yes | Active and passive items shown in the passive area, with the yesBehavior filter |
| `hp_colors_v2` | no | HP Colors Rewrite v2. Mutually exclusive with `hp_colors_v3` |
| `poker` | no | ESC-menu table games (Poker and Bluff Deck) |
| `abilities_no_behavior` | no | Same as above without the behavior filter |
| `hud_3d` | no | 3D hero dynamic models HUD |

All modules that touch the same layout (ESC menu, top bar) are merged by `scripts/merge-custom-pack.mjs`, so they do not overwrite each other.

### Where each part comes from

| Part | Source directory |
| --- | --- |
| ShowRank runtime, layouts, styles | `showrank_barebones/` (kept in sync with upstream) and `showrank_recent_purchases/` (the AIO base: Recent Purchases, hero shop, hero testing, topbar QoL) |
| Topbar QoL (ult cooldown, nicknames, soul difference) | `showrank_recent_purchases/panorama/scripts/topbar_qol.js` |
| VS COMMUNITY stats | `profile_stats_community/`, composed into the ShowRank runtime by `scripts/profile-stats-community-composition.js` |
| Buff/Rift minimap timers | `buff_timer_virgin/` |
| HP Colors v3 | `hp_colors_v3/` (decompiled release, minified: replace it, do not hand-edit) |
| HP Colors v2 | `hp_colors_rewrite_v2/` |
| Passive items | `abilities/scripts/` and `standalone_redesign/` |

## Requirements

Windows with:

- Deadlock installed. The builder auto-detects `...\Deadlock\game\citadel\addons` on `D:`, `G:` or the default Steam path, or you can pass `-AddonsPath`.
- Source 2 Workshop Tools compiler (`sr2compiler/`, driven by the bundled `New folder.exe` wrapper and `pref.json`).
- Node.js and PowerShell. Python (`py`) for the abilities modules.
- `vpkeditcli.exe` (bundled lookups); the scripts fall back to a pure Node VPK packer if it is missing.

## Build and install

```powershell
# Default modules (showrank_qol, hp_colors_v3, abilities_yes_behavior), install into addons
cmd.exe /c "build_custom_pack.bat -Modules showrank_qol,hp_colors_v3,abilities_yes_behavior -PakName pak01_dir.vpk -Install"

# Interactive module picker
build_custom_pack.bat
```

Module ids, or numbers `1` showrank_qol, `2` hp_colors_v2, `3` poker, `4` abilities_no_behavior, `5` abilities_yes_behavior, `6` hud_3d, `7` hp_colors_v3, are accepted by `-Modules`. The result is `pak01_dir.vpk` in the repo root.

- Close Deadlock before installing; the script refuses to overwrite the pak while the game runs.
- Never hand-edit `_custom_pack_build/`, `*_compiled/` or any `.vpk`. The builder recreates them.
- Other paks in `addons/` (`pak02`..`pak04`, etc.) are not touched. Pak slots are shared between standalone builds, so avoid combining standalone builds with the AIO when they override the same files.

### Enable mod loading (one time)

1. Open `...\Deadlock\game\citadel\gameinfo.gi`.
2. In `SearchPaths`, add `Game citadel/addons` **above** `Game citadel`:

   ```text
   SearchPaths
   {
       Game citadel/addons
       Game citadel
       Game core
       ...
   }
   ```

3. Save. Deadlock may rewrite this file on update; re-add the line if mods stop loading.

## Updating for a Deadlock patch

1. Compare `SteamDatabase/GameTracking-Deadlock` against the last baseline for the overridden Panorama files. Rebase any that changed, keeping every stock panel ID.
2. If `scripts/abilities.vdata` changed, refresh `abilities/scripts/abilities.vdata` and `abilities2.vdata` (strip the `_include` block) and run the abilities test.
3. Rebuild and reinstall the pack.

```powershell
cd abilities\scripts; py test_active.py
node --test scripts\validate-showrank-recent-purchases.test.js scripts\validate-custom-pack-merger.test.js
```

## Testing in game

Launch Deadlock with `-dev -tools`, open the Panorama debugger (`F7`) or VConsole (`F8`), run `panorama_reload_layout` and confirm there are no script errors or `Unable to find child` messages. Static validators and the build only prove the sources and package contents, not in-game behavior.

## Standalone modules

These still build on their own through their own `build_*.ps1` wrappers. Run the focused validator first where one exists.

- Full HP Colors / ANITA UI: `build_hp_colors.ps1`; minimal: `build_hp_colors_minimal.ps1`; Rewrite v2 / QOLLOCK: `build_hp_colors_rewrite_v2.ps1`, `build_hp_colors_rewrite_v2_qollock.ps1`
- ShowRank variants: `build_showrank_variants.ps1`; ShowRank + Recent Purchases + Hideout Testing: `build_showrank_recent_purchases.ps1`
- Developer Testing Tools HUD: `build_testing_tools.ps1`
- Buff timers, recent purchase, Poker and others: see the `build_*.ps1` files in the repo root.

`AGENTS.md` and `CONTEXT-MAP.md` describe each lane's contracts in more detail.

## Credits and upstream

- Original collection and ShowRank / HP Colors lines by [Hantu-Raya](https://github.com/Hantu-Raya).
- ByteNode: Recent Purchases and purchase popups.
- Top Bar Plus by bonclide, merged with ShowRank in upstream's [Show-rank-merger](https://github.com/Hantu-Raya/Show-rank-merger).
- Rank data from [deadlock-api](https://deadlock-api.com).

## License

Unless otherwise noted, original code and original mod source in this repository are licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE). Attribution notices are in [NOTICE](NOTICE); preserve `LICENSE` and `NOTICE` when distributing this project or derivative works.

Deadlock, Source 2, Valve, Panorama, and related names, paths, formats, trademarks, and game assets belong to their respective owners. This project is an unofficial fan modification and is not affiliated with Valve.
