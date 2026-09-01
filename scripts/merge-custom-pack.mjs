import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { writeBarebonesSources } = require('./profile-stats-community-composition.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

export function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function mergeEscapeMenuXml(baseXml, options = {}) {
  const {
    pokerXml = '',
    hpColorsXml = '',
    enableShowrank = true,
    enablePoker = false,
    enableHpColors = false
  } = options;

  let result = baseXml;

  // 1. Ensure basic root structure
  if (!result.includes('<CitadelHudEscapeMenu')) {
    result = `<!-- Stock hud_escape_menu.xml merged for Deadlock custom pack -->
<root>
\t<styles>
\t\t<include src="s2r://panorama/styles/citadel_base_styles.vcss_c" />
\t\t<include src="s2r://panorama/styles/hud_escape_menu.vcss_c" />
\t</styles>
\t<scripts>
\t</scripts>
\t<CitadelHudEscapeMenu oncancel="CitadelResumePlaying()">
\t\t<Panel id="EscapeBackground" onactivate="CitadelResumePlaying()" />
\t\t<Panel id="LeftStripeBlur" />
\t\t<Panel id="LeftStripe" hittest="false">
\t\t\t<Panel id="Menu" hittest="false">
\t\t\t\t<Panel id="ContextualMenu">
\t\t\t\t\t<Panel class="MatchmakingOptions OptionGroup">
\t\t\t\t\t\t<Button id="matchmakingLeaveQueue" class="nav_menu_item primary endsession" onactivate="CitadelLeaveMatchmaking()">
\t\t\t\t\t\t\t<Label text="#menu_leave_queue" class="menuButtonLabel" antialias="true" />
\t\t\t\t\t\t</Button>
\t\t\t\t\t\t<Button id="matchmakingEditRoster" class="nav_menu_item primary" onactivate="CitadelEditMatchmakingRoster()">
\t\t\t\t\t\t\t<Panel class="MenuIcon" />
\t\t\t\t\t\t\t<Label text="#menu_edit_roster" class="menuButtonLabel" />
\t\t\t\t\t\t</Button>
\t\t\t\t\t</Panel>
\t\t\t\t\t<Panel class="ReconnectOptions OptionGroup">
\t\t\t\t\t\t<Button id="reconnectRejoin" class="nav_menu_item primary" onactivate="CitadelReconnect()" onmouseover="UIShowTextTooltip( #Citadel_Dashboard_RejoinTooltip )" onmouseout="UIHideTextTooltip()">
\t\t\t\t\t\t\t<Label text="#menu_rejoin" class="menuButtonLabel" />
\t\t\t\t\t\t</Button>
\t\t\t\t\t\t<Button id="reconnectAbandon" class="nav_menu_item primary endsession" onactivate="CitadelConfirmAbandonGame()">
\t\t\t\t\t\t\t<Label text="{s:reconnect_abandon_action}" class="menuButtonLabel" />
\t\t\t\t\t\t</Button>
\t\t\t\t\t</Panel>
\t\t\t\t\t<Button id="disconnect" class="nav_menu_item primary" onactivate="CitadelDisconnectFromGame()">
\t\t\t\t\t\t<Label text="#menu_disconnect" class="menuButtonLabel" />
\t\t\t\t\t</Button>
\t\t\t\t\t<Button id="abandon" class="nav_menu_item primary endsession" onactivate="CitadelConfirmAbandonGame()">
\t\t\t\t\t\t<Label text="{s:abandon_action}" class="menuButtonLabel" />
\t\t\t\t\t</Button>
\t\t\t\t\t<Button id="Unstick" class="nav_menu_item minor" onactivate="CitadelConCommand( &apos;unstick&apos; );" onmouseover="CitadelUIShowTextTooltip( &apos;#DevMenu_UnstickHeroTooltip&apos; )" onmouseout="CitadelUIHideTextTooltip()">
\t\t\t\t\t\t<Label text="#DevMenu_UnstickHero" class="menuButtonLabel" />
\t\t\t\t\t</Button>
\t\t\t\t</Panel>
\t\t\t\t<Button id="changehero" class="nav_menu_item primary" onactivate="CitadelEscapeMenuChangeHero()">
\t\t\t\t\t<Label text="#menu_changehero" class="menuButtonLabel" />
\t\t\t\t</Button>
\t\t\t\t<Panel id="SubOptions">
\t\t\t\t\t<Panel class="FeedbackRow">
\t\t\t\t\t\t<Button id="PlayerFeedback" class="nav_menu_item minor" onactivate="CitadelShowPlayerFeedbackPopup()">
\t\t\t\t\t\t\t<Label text="#Citadel_PlayerFeedback_Title" class="menuButtonLabel" />
\t\t\t\t\t\t</Button>
\t\t\t\t\t</Panel>
\t\t\t\t\t<Panel class="SettingsRow">
\t\t\t\t\t\t<Button id="settings" class="nav_menu_item minor" onactivate="CitadelSettings()">
\t\t\t\t\t\t\t<Panel class="smallIcon GearIcon" />
\t\t\t\t\t\t\t<Label text="#menu_settings" class="menuButtonLabel" />
\t\t\t\t\t\t</Button>
\t\t\t\t\t\t<Button id="QuickMute" class="nav_menu_item minor" onactivate="CitadelMuteButtonClicked();" onmouseover="CitadelUIShowTextTooltip( &apos;#citadel_mute_game_audio&apos; )" onmouseout="CitadelUIHideTextTooltip()" />
\t\t\t\t\t</Panel>
\t\t\t\t\t<Button id="quit" onactivate="CitadelQuitConfirm()">
\t\t\t\t\t\t<Label text="#menu_exit_deadlock" />
\t\t\t\t\t</Button>
\t\t\t\t</Panel>
\t\t\t</Panel>
\t\t</Panel>
\t\t<CitadelBindingButton id="EscapeButton" action="MenuBack" onactivate="CitadelResumePlaying()" text="#menu_resume" />
\t\t<Panel id="RightSideBlur" hittest="false" />
\t\t<Panel id="RightSide" hittest="false">
\t\t\t<Panel id="PartySpacer" />
\t\t\t<Panel class="FriendsOrPlayersTabs">
\t\t\t\t<Panel class="Center">
\t\t\t\t\t<TabButton id="FriendsTab" class="FriendsOrPlayersButton" group="people_list_tabs" text="#Citadel_Friends_WindowTitle" selected="true" />
\t\t\t\t\t<TabButton id="PlayersTab" class="FriendsOrPlayersButton" group="people_list_tabs" text="#Citadel_Players_WindowTitle" />
\t\t\t\t</Panel>
\t\t\t</Panel>
\t\t\t<Panel class="FriendsOrPlayersContents" hittest="false">
\t\t\t\t<TabContents id="FriendsTabContents" tabid="FriendsTab" group="people_list_tabs" hittest="false" selected="true">
\t\t\t\t\t<CitadelFriendsList id="FriendsList" />
\t\t\t\t</TabContents>
\t\t\t\t<TabContents id="PlayersTabContents" tabid="PlayersTab" group="people_list_tabs" hittest="false">
\t\t\t\t\t<CitadelPlayersList id="PlayersList" />
\t\t\t\t</TabContents>
\t\t\t</Panel>
\t\t</Panel>
\t</CitadelHudEscapeMenu>
</root>`;
  }

  // 2. ShowRank script include
  if (enableShowrank && !result.includes('showrank_barebones.vjs_c')) {
    result = result.replace(
      '</scripts>',
      '\t\t<include src="s2r://panorama/scripts/showrank_barebones.vjs_c" />\n\t</scripts>'
    );
  }

  // 3. Poker integration
  if (enablePoker) {
    if (!result.includes('poker_escape_menu.vcss_c')) {
      result = result.replace(
        '</styles>',
        '\t\t<include src="s2r://panorama/styles/poker_escape_menu.vcss_c" />\n\t</styles>'
      );
    }
    if (!result.includes('poker_escape_menu.vjs_c')) {
      result = result.replace(
        '</scripts>',
        '\t\t<include src="s2r://panorama/scripts/poker_escape_menu.vjs_c" />\n\t</scripts>'
      );
    }
    if (!result.includes('id="PokerMenuButton"')) {
      const pokerBtn = '\t\t\t\t<Button id="PokerMenuButton" class="nav_menu_item primary PokerMenuButton" onactivate="PokerEscapeMenuToggle()">\n\t\t\t\t\t<Label text="TABLE GAMES" class="menuButtonLabel" />\n\t\t\t\t</Button>\n\t\t\t\t<Panel id="SubOptions">';
      result = result.replace('<Panel id="SubOptions">', pokerBtn);
    }

    const pokerTag = '<Panel id="TableGamePickerWindow"';
    const pokerStartIndex = pokerXml ? pokerXml.indexOf(pokerTag) : -1;
    if (pokerStartIndex !== -1 && !result.includes('id="TableGamePickerWindow"')) {
      const pokerEndIndex = pokerXml.lastIndexOf('</CitadelHudEscapeMenu>');
      if (pokerEndIndex !== -1) {
        const pokerPanels = pokerXml.slice(pokerStartIndex, pokerEndIndex).trim();
        result = result.replace('</CitadelHudEscapeMenu>', '\t\t' + pokerPanels + '\n\t</CitadelHudEscapeMenu>');
      }
    }
  }

  // 4. HP Colors v2 integration
  if (enableHpColors) {
    if (!result.includes('hp_colors_v2_menu.vcss_c')) {
      result = result.replace(
        '</styles>',
        '\t\t<include src="s2r://panorama/styles/hp_colors_v2_menu.vcss_c" />\n\t</styles>'
      );
    }
    if (!result.includes('hp_colors_v2_contract.vjs_c')) {
      result = result.replace(
        '</scripts>',
        '\t\t<include src="s2r://panorama/scripts/hp_colors_v2_contract.vjs_c" />\n\t\t<include src="s2r://panorama/scripts/hp_colors_v2_state.vjs_c" />\n\t\t<include src="s2r://panorama/scripts/hp_colors_v2_menu.vjs_c" />\n\t</scripts>'
      );
    }
    if (!result.includes('id="HPColorsMenuButton"')) {
      const hpBtn = `\t\t\t\t\t<Button id="HPColorsMenuButton" class="nav_menu_item minor">\n\t\t\t\t\t\t<Label text="HP COLORS V2" class="menuButtonLabel" />\n\t\t\t\t\t</Button>\n\t\t\t\t\t<Panel class="SettingsRow">`;
      if (result.includes('<Panel class="SettingsRow">')) {
        result = result.replace('<Panel class="SettingsRow">', hpBtn);
      } else {
        result = result.replace('</Panel>\n\t\t\t</Panel>', hpBtn + '\n\t\t\t\t</Panel>\n\t\t\t</Panel>');
      }
    }

    const hpEditorTag = '<Panel id="HPColorsEditorRoot"';
    const hpStartIndex = hpColorsXml ? hpColorsXml.indexOf(hpEditorTag) : -1;
    if (hpStartIndex !== -1 && !result.includes('id="HPColorsEditorRoot"')) {
      const hpEndIndex = hpColorsXml.lastIndexOf('</CitadelHudEscapeMenu>');
      if (hpEndIndex !== -1) {
        const hpPanels = hpColorsXml.slice(hpStartIndex, hpEndIndex).trim();
        result = result.replace('</CitadelHudEscapeMenu>', '\t\t' + hpPanels + '\n\t</CitadelHudEscapeMenu>');
      }
    }

    // Cancel and Escape button handling for HP Colors modal
    const cancelHandler = 'if ($.HPColorsMenuCancel &amp;&amp; $.HPColorsMenuCancel()) {} else { $.DispatchEvent(&apos;CitadelResumePlaying&apos;, $.GetContextPanel()); }';
    result = result.replace(/<Panel\s+id="EscapeBackground"[^>]*\/>/, `<Panel id="EscapeBackground" onactivate="${cancelHandler}" />`);
    result = result.replace(/<CitadelBindingButton\s+id="EscapeButton"[^>]*\/>/, `<CitadelBindingButton id="EscapeButton" action="MenuBack" onactivate="${cancelHandler}" text="#menu_resume" />`);
  }

  // 5. Harmonize root CitadelHudEscapeMenu attributes
  const onloadCalls = [];
  if (enableShowrank) onloadCalls.push('if ($.ShowRankBarebonesEscapeOpen) $.ShowRankBarebonesEscapeOpen();');
  if (enableHpColors) onloadCalls.push('if ($.HPColorsMenuBoot) $.HPColorsMenuBoot();');

  const oncancelHandler = enableHpColors
    ? 'if ($.HPColorsMenuCancel &amp;&amp; $.HPColorsMenuCancel()) {} else { $.DispatchEvent(&apos;CitadelResumePlaying&apos;, $.GetContextPanel()); }'
    : 'CitadelResumePlaying()';

  let openTag = '<CitadelHudEscapeMenu';
  if (onloadCalls.length > 0) openTag += ` onload="${onloadCalls.join(' ')}"`;
  if (enableShowrank) {
    openTag += ' onmouseover="if ($.ShowRankBarebonesEscapeOpen) $.ShowRankBarebonesEscapeOpen();"';
    openTag += ' onmouseout="if ($.ShowRankBarebonesEscapeOut) $.ShowRankBarebonesEscapeOut();"';
  }
  openTag += ` oncancel="${oncancelHandler}">`;

  result = result.replace(/<CitadelHudEscapeMenu\b[^>]*>/, openTag);

  return result;
}

export function assembleCustomPack(options) {
  const {
    stageSourceDir,
    modules = {
      showrank_qol: true,
      hp_colors_v2: true,
      poker: false,
      abilities_no_behavior: false,
      abilities_yes_behavior: true,
      buff_timer: true,
      hud_3d: false
    }
  } = options;

  if (fs.existsSync(stageSourceDir)) {
    fs.rmSync(stageSourceDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stageSourceDir, { recursive: true });

  let escapeBaseXml = '';

  // 1. ShowRank + Topbar QoL (Recent Purchases, Testing Tools, Community Stats)
  if (modules.showrank_qol) {
    const showrankDir = path.join(repoRoot, 'showrank_recent_purchases');
    copyDirSync(path.join(showrankDir, 'panorama'), path.join(stageSourceDir, 'panorama'));

    // Compose Profile Stats Community runtime and styles into staged showrank assets
    try {
      writeBarebonesSources(repoRoot, stageSourceDir, showrankDir);
    } catch (err) {
      console.warn(`[CustomPackMerger] Warning: Community stats composition: ${err.message}`);
    }

    const showrankEscape = path.join(showrankDir, 'panorama/layout/hud_escape_menu.xml');
    if (fs.existsSync(showrankEscape)) {
      escapeBaseXml = fs.readFileSync(showrankEscape, 'utf8');
    }
  }

  // 2. HP Colors Rewrite v2
  let hpColorsXml = '';
  if (modules.hp_colors_v2) {
    const hpDir = path.join(repoRoot, 'hp_colors_rewrite_v2');

    // Layout
    const overlaySrc = path.join(hpDir, 'panorama/layout/unit_status_overlay_v2.xml');
    const overlayDest = path.join(stageSourceDir, 'panorama/layout/unit_status_overlay_v2.xml');
    fs.mkdirSync(path.dirname(overlayDest), { recursive: true });
    if (fs.existsSync(overlaySrc)) {
      fs.copyFileSync(overlaySrc, overlayDest);
    }

    // Scripts
    const hpScripts = [
      'hp_colors_v2_contract.js',
      'hp_colors_v2_state.js',
      'hp_colors_v2_menu.js',
      'unit_status_v2_colors.js',
      'unit_status_v2_segment_align.js'
    ];
    for (const s of hpScripts) {
      const src = path.join(hpDir, 'panorama/scripts', s);
      const dest = path.join(stageSourceDir, 'panorama/scripts', s);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }

    // Styles
    const hpStyles = ['hp_colors_v2_menu.css', 'unit_status_v2.css'];
    for (const s of hpStyles) {
      const src = path.join(hpDir, 'panorama/styles', s);
      const dest = path.join(stageSourceDir, 'panorama/styles', s);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }

    const hpEscapeSrc = path.join(hpDir, 'panorama/layout/hud_escape_menu.xml');
    if (fs.existsSync(hpEscapeSrc)) {
      hpColorsXml = fs.readFileSync(hpEscapeSrc, 'utf8');
    }
  }

  // 3. Poker & Bluff Deck Table Games
  let pokerXml = '';
  if (modules.poker) {
    const pokerDir = path.join(repoRoot, 'poker');
    
    const chatSrc = path.join(pokerDir, 'panorama/layout/chat.xml');
    const chatDest = path.join(stageSourceDir, 'panorama/layout/chat.xml');
    fs.mkdirSync(path.dirname(chatDest), { recursive: true });
    if (fs.existsSync(chatSrc)) {
      fs.copyFileSync(chatSrc, chatDest);
    }

    const pokerScriptsDir = path.join(pokerDir, 'panorama/scripts');
    if (fs.existsSync(pokerScriptsDir)) {
      for (const f of fs.readdirSync(pokerScriptsDir)) {
        if (f.startsWith('poker_') || f.startsWith('bluff_')) {
          fs.copyFileSync(path.join(pokerScriptsDir, f), path.join(stageSourceDir, 'panorama/scripts', f));
        }
      }
    }

    const pokerStylesDir = path.join(pokerDir, 'panorama/styles');
    if (fs.existsSync(pokerStylesDir)) {
      for (const f of fs.readdirSync(pokerStylesDir)) {
        if (f.startsWith('poker_') || f.startsWith('bluff_')) {
          fs.copyFileSync(path.join(pokerStylesDir, f), path.join(stageSourceDir, 'panorama/styles', f));
        }
      }
    }

    const pokerImagesSrc = path.join(pokerDir, 'panorama/images/poker');
    const pokerImagesDest = path.join(stageSourceDir, 'panorama/images/poker');
    copyDirSync(pokerImagesSrc, pokerImagesDest);

    const pokerEscapeMenuSrc = path.join(pokerDir, 'panorama/layout/hud_escape_menu.xml');
    if (fs.existsSync(pokerEscapeMenuSrc)) {
      pokerXml = fs.readFileSync(pokerEscapeMenuSrc, 'utf8');
    }
  }

  // 4. Merge ESC Menu XML
  const mergedEscape = mergeEscapeMenuXml(escapeBaseXml, {
    pokerXml,
    hpColorsXml,
    enableShowrank: !!modules.showrank_qol,
    enablePoker: !!modules.poker,
    enableHpColors: !!modules.hp_colors_v2
  });

  const escapeMenuDest = path.join(stageSourceDir, 'panorama/layout/hud_escape_menu.xml');
  fs.mkdirSync(path.dirname(escapeMenuDest), { recursive: true });
  fs.writeFileSync(escapeMenuDest, mergedEscape, 'utf8');

  // 5. Buff Timer & Rejuvenator HUD
  if (modules.buff_timer) {
    const buffDir = path.join(repoRoot, 'buff_timer_virgin');
    const hudSrc = path.join(buffDir, 'panorama/layout/hud.xml');
    const hudDest = path.join(stageSourceDir, 'panorama/layout/hud.xml');
    fs.mkdirSync(path.dirname(hudDest), { recursive: true });
    if (fs.existsSync(hudSrc)) {
      fs.copyFileSync(hudSrc, hudDest);
    }
    copyDirSync(path.join(buffDir, 'panorama/scripts'), path.join(stageSourceDir, 'panorama/scripts'));
    copyDirSync(path.join(buffDir, 'panorama/styles'), path.join(stageSourceDir, 'panorama/styles'));
  }

  // 6. 3D Hero HUD
  if (modules.hud_3d) {
    const hud3dDir = path.join(repoRoot, '3d hud');
    const hudHealthSrc = path.join(hud3dDir, 'panorama/layout/hud_health.xml');
    const hudHealthDest = path.join(stageSourceDir, 'panorama/layout/hud_health.xml');
    fs.mkdirSync(path.dirname(hudHealthDest), { recursive: true });
    if (fs.existsSync(hudHealthSrc)) {
      fs.copyFileSync(hudHealthSrc, hudHealthDest);
    }
    const scriptSrc = path.join(hud3dDir, 'panorama/scripts/3d_hero_dynamic.js');
    if (fs.existsSync(scriptSrc)) {
      fs.copyFileSync(scriptSrc, path.join(stageSourceDir, 'panorama/scripts/3d_hero_dynamic.js'));
    }
    const styleSrc = path.join(hud3dDir, 'panorama/styles/3d_hud.css');
    if (fs.existsSync(styleSrc)) {
      fs.copyFileSync(styleSrc, path.join(stageSourceDir, 'panorama/styles/3d_hud.css'));
    }
  }

  // 7. Passive & Active Items Area modifications
  if (modules.abilities_no_behavior || modules.abilities_yes_behavior) {
    const scriptName = modules.abilities_yes_behavior ? 'active.py' : 'active_no_behavior.py';
    const pyScriptPath = path.join(repoRoot, 'abilities/scripts', scriptName);
    const vdataSrc = path.join(repoRoot, 'abilities/scripts/abilities.vdata');
    const vdataDest = path.join(stageSourceDir, 'scripts/abilities.vdata');
    fs.mkdirSync(path.dirname(vdataDest), { recursive: true });

    try {
      execFileSync('py', [pyScriptPath, vdataSrc, vdataDest], {
        cwd: path.join(repoRoot, 'abilities/scripts'),
        encoding: 'utf8'
      });
    } catch (err) {
      execFileSync('python', [pyScriptPath, vdataSrc, vdataDest], {
        cwd: path.join(repoRoot, 'abilities/scripts'),
        encoding: 'utf8'
      });
    }

    if (fs.existsSync(vdataDest)) {
      let content = fs.readFileSync(vdataDest, 'utf8');
      const includePattern = /^\s*_include\s*=\s*\r?\n\s*\[\s*\r?\n(?:\s*resource_name:"[^"]+",?\s*\r?\n)+\s*\]\s*\r?\n/m;
      content = content.replace(includePattern, '');
      content = content.replace(/m_bShowInPassiveItemsArea\s*=\s*"true"/g, 'm_bShowInPassiveItemsArea = true');
      content = content.replace(/m_bShowInPassiveItemsArea\s*=\s*"false"/g, 'm_bShowInPassiveItemsArea = false');
      fs.writeFileSync(vdataDest, content, 'utf8');
    }

    // Include HUD styles to place passive/active items under crosshair and make them visible
    const passiveStylesDir = path.join(repoRoot, 'standalone_redesign/panorama/styles');
    if (fs.existsSync(passiveStylesDir)) {
      copyDirSync(passiveStylesDir, path.join(stageSourceDir, 'panorama/styles'));
    }
  }

  return { success: true, stagedDir: stageSourceDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  let stageDir = path.join(repoRoot, '_custom_pack_build/src');
  let selected = 'showrank_qol,hp_colors_v2,abilities_yes_behavior,buff_timer';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stage' && args[i + 1]) stageDir = args[i + 1];
    if (args[i] === '--modules' && args[i + 1]) selected = args[i + 1];
  }

  const list = selected.split(',').map((s) => s.trim().toLowerCase());
  const modules = {
    showrank_qol: list.includes('showrank') || list.includes('showrank_qol') || list.includes('qol') || list.includes('1'),
    hp_colors_v2: list.includes('hp_colors_v2') || list.includes('hp_colors') || list.includes('hp') || list.includes('hpv2') || list.includes('2'),
    poker: list.includes('poker') || list.includes('3'),
    abilities_no_behavior: list.includes('abilities_no_behavior') || list.includes('active_no_filter') || list.includes('pak05') || list.includes('4'),
    abilities_yes_behavior: list.includes('abilities_yes_behavior') || list.includes('active_yes_filter') || list.includes('pak03') || list.includes('5'),
    buff_timer: list.includes('buff_timer') || list.includes('buff') || list.includes('6'),
    hud_3d: list.includes('hud_3d') || list.includes('3d') || list.includes('7')
  };

  const result = assembleCustomPack({
    stageSourceDir: stageDir,
    modules
  });

  console.log(JSON.stringify(result));
}
