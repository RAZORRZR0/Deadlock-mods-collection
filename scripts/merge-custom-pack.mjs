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
\t\t<CitadelPrivilegedFeatures id="PrivilegedFeatures" />
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

export function mergeTopBarXml(baseXml, options = {}) {
  const { enableHpColors = false } = options;
  if (!enableHpColors || !baseXml) return baseXml;

  let result = baseXml;

  // 1. Ensure scripts include hp_colors_v2_contract.vjs_c and test_topbar_pickups.vjs_c
  const requiredScripts = [
    's2r://panorama/scripts/hp_colors_v2_contract.vjs_c',
    's2r://panorama/scripts/test_topbar_pickups.vjs_c'
  ];
  for (const script of requiredScripts) {
    if (!result.includes(script)) {
      result = result.replace(
        '</scripts>',
        `\t\t<include src="${script}" />\n\t</scripts>`
      );
    }
  }

  // 2. Ensure CitadelHudTopBar has class="HPV2PickupTopBar"
  result = result.replace(/<CitadelHudTopBar\b([^>]*)>/, (match, attrs) => {
    if (attrs.includes('HPV2PickupTopBar')) {
      return match;
    }
    const classMatch = attrs.match(/class="([^"]*)"/);
    if (classMatch) {
      return match.replace(/class="([^"]*)"/, `class="HPV2PickupTopBar $1"`);
    } else {
      return `<CitadelHudTopBar class="HPV2PickupTopBar"${attrs}>`;
    }
  });

  return result;
}

// Every hero ability effect on another hero -> topbar icons (Dijjin_Ability_decomp).
// Injected into already-staged ShowRank/HP layouts so no other pak overrides the same files.
export function mergeAbilityMarks(stageSourceDir) {
  const src = path.join(repoRoot, 'Dijjin_Ability_decomp/panorama');
  const dest = path.join(stageSourceDir, 'panorama');
  const includes = (kind, names) => names.map((n) => `\t<include src="s2r://panorama/${kind}/${n}" />\n\t`).join('');
  const insertBefore = (xml, anchor, text, file) => {
    if (!xml.includes(anchor)) throw new Error(`[ability_marks] ${file}: anchor not found: ${anchor}`);
    return xml.replace(anchor, text + anchor);
  };

  copyDirSync(path.join(src, 'scripts'), path.join(dest, 'scripts'));
  copyDirSync(path.join(src, 'styles'), path.join(dest, 'styles'));
  fs.mkdirSync(path.join(dest, 'layout'), { recursive: true });
  fs.copyFileSync(path.join(src, 'layout/djinn_mark_relay.xml'), path.join(dest, 'layout/djinn_mark_relay.xml'));

  // Healthbar publishers: patch staged overlays (HP Colors v2), else ship the decomp's stock-based copies.
  const publisher = includes('scripts', ['djinn_mark_common.vjs_c', 'djinn_mark_relay.vjs_c', 'djinn_mark_healthbar.vjs_c']);
  for (const file of ['unit_status_overlay.xml', 'unit_status_overlay_old.xml', 'unit_status_overlay_v2.xml']) {
    const staged = path.join(dest, 'layout', file);
    if (fs.existsSync(staged)) {
      fs.writeFileSync(staged, insertBefore(fs.readFileSync(staged, 'utf8'), '</scripts>', publisher, file), 'utf8');
    } else if (fs.existsSync(path.join(src, 'layout', file))) {
      fs.copyFileSync(path.join(src, 'layout', file), staged);
    }
  }

  // Topbar consumer: patch ShowRank's staged player card, else ship the decomp's copy.
  const topbarFile = 'citadel_hud_top_bar_player.xml';
  const stagedTopbar = path.join(dest, 'layout', topbarFile);
  const decompTopbar = fs.readFileSync(path.join(src, 'layout', topbarFile), 'utf8');
  if (!fs.existsSync(stagedTopbar)) {
    fs.writeFileSync(stagedTopbar, decompTopbar, 'utf8');
    return;
  }
  const marks = decompTopbar.match(/<Panel id="TopbarAbilityMarks"[\s\S]*?\n\t{4}<\/Panel>/);
  if (!marks) throw new Error(`[ability_marks] ${topbarFile}: TopbarAbilityMarks block not found in decomp`);
  let xml = fs.readFileSync(stagedTopbar, 'utf8');
  xml = insertBefore(xml, '</styles>', includes('styles', ['unit_status_icons.vcss_c', 'djinn_mark_topbar.vcss_c']), topbarFile);
  xml = insertBefore(xml, '</scripts>', includes('scripts', ['djinn_mark_common.vjs_c', 'djinn_mark_topbar.vjs_c']), topbarFile);
  xml = insertBefore(xml, '<Panel class="Rejuvenator">', `${marks[0]}\n\t\t\t\t`, topbarFile);
  fs.writeFileSync(stagedTopbar, xml, 'utf8');
}

export function assembleCustomPack(options) {
  const {
    stageSourceDir,
    modules = {
      showrank_qol: true,
      hp_colors_v2: false,
      poker: false,
      abilities_no_behavior: false,
      abilities_yes_behavior: true,
      hud_3d: false,
      ability_marks: false
    }
  } = options;

  if (fs.existsSync(stageSourceDir)) {
    fs.rmSync(stageSourceDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stageSourceDir, { recursive: true });

  let escapeBaseXml = '';

  // 1. ShowRank + Topbar QoL (Recent Purchases, Community Stats) + Buff/Rift minimap timers
  if (modules.showrank_qol) {
    const showrankDir = path.join(repoRoot, 'showrank_recent_purchases');
    copyDirSync(path.join(showrankDir, 'panorama'), path.join(stageSourceDir, 'panorama'));
    // Buff/Rift minimap timers: buff_timer_virgin's hud_minimap.xml override (Hantu-Raya upstream).
    copyDirSync(path.join(repoRoot, 'buff_timer_virgin/panorama'), path.join(stageSourceDir, 'panorama'));
    for (const f of ['rejuvnbufftimer.js', 'bt_minimap_settings.js']) {
      const p = path.join(stageSourceDir, 'panorama/scripts', f);
      const src = fs.readFileSync(p, 'utf8');
      const out = src.replace(/\s*\/\/ TEST_EXPORTS_BEGIN[\s\S]*?\/\/ TEST_EXPORTS_END\s*/, '\n');
      if (out === src) throw new Error(`[showrank_qol] ${f}: TEST_EXPORTS markers not found`);
      fs.writeFileSync(p, out, 'utf8');
    }

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

    const relaySrc = path.join(hpDir, 'panorama/layout/test_event_relay.xml');
    const relayDest = path.join(stageSourceDir, 'panorama/layout/test_event_relay.xml');
    if (fs.existsSync(relaySrc)) {
      fs.copyFileSync(relaySrc, relayDest);
    }

    const topbarDest = path.join(stageSourceDir, 'panorama/layout/citadel_hud_top_bar.xml');
    if (modules.showrank_qol && fs.existsSync(topbarDest)) {
      const topbarXml = fs.readFileSync(topbarDest, 'utf8');
      const mergedTopbar = mergeTopBarXml(topbarXml, { enableHpColors: true });
      fs.writeFileSync(topbarDest, mergedTopbar, 'utf8');
    } else {
      const topbarSrc = path.join(hpDir, 'panorama/layout/citadel_hud_top_bar.xml');
      if (fs.existsSync(topbarSrc)) {
        fs.mkdirSync(path.dirname(topbarDest), { recursive: true });
        fs.copyFileSync(topbarSrc, topbarDest);
      }
    }

    // Scripts
    const hpScriptsDir = path.join(hpDir, 'panorama/scripts');
    if (fs.existsSync(hpScriptsDir)) {
      for (const f of fs.readdirSync(hpScriptsDir)) {
        if (f.endsWith('.js')) {
          fs.copyFileSync(path.join(hpScriptsDir, f), path.join(stageSourceDir, 'panorama/scripts', f));
        }
      }
    }

    // Styles
    const hpStylesDir = path.join(hpDir, 'panorama/styles');
    if (fs.existsSync(hpStylesDir)) {
      for (const f of fs.readdirSync(hpStylesDir)) {
        if (f.endsWith('.css')) {
          fs.copyFileSync(path.join(hpStylesDir, f), path.join(stageSourceDir, 'panorama/styles', f));
        }
      }
    }

    // Images
    const hpImagesDir = path.join(hpDir, 'panorama/images');
    if (fs.existsSync(hpImagesDir)) {
      copyDirSync(hpImagesDir, path.join(stageSourceDir, 'panorama/images'));
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

  // 8. Topbar ability marks (after ShowRank/HP layouts are staged)
  if (modules.ability_marks) {
    mergeAbilityMarks(stageSourceDir);
  }

  return { success: true, stagedDir: stageSourceDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  let stageDir = path.join(repoRoot, '_custom_pack_build/src');
  let selected = 'showrank_qol,abilities_yes_behavior';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stage' && args[i + 1]) stageDir = args[i + 1];
    if (args[i] === '--modules' && args[i + 1]) selected = args[i + 1];
  }

  const list = selected.split(/[,; ]+/).map((s) => s.trim().toLowerCase());
  const modules = {
    showrank_qol: list.includes('showrank') || list.includes('showrank_qol') || list.includes('qol') || list.includes('1'),
    hp_colors_v2: list.includes('hp_colors_v2') || list.includes('hp_colors') || list.includes('hp') || list.includes('hpv2') || list.includes('2'),
    poker: list.includes('poker') || list.includes('3'),
    abilities_no_behavior: list.includes('abilities_no_behavior') || list.includes('active_no_filter') || list.includes('pak05') || list.includes('4'),
    abilities_yes_behavior: list.includes('abilities_yes_behavior') || list.includes('active_yes_filter') || list.includes('pak03') || list.includes('5'),
    hud_3d: list.includes('hud_3d') || list.includes('3d') || list.includes('6'),
    ability_marks: list.includes('ability_marks') || list.includes('marks') || list.includes('7')
  };

  const result = assembleCustomPack({
    stageSourceDir: stageDir,
    modules
  });

  console.log(JSON.stringify(result));
}
