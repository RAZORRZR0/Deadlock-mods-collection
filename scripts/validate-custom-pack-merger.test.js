import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeEscapeMenuXml, assembleCustomPack } from './merge-custom-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

test('mergeEscapeMenuXml: combines ShowRank, Poker, and HP Colors Rewrite v2', () => {
  const showrankXml = fs.readFileSync(path.join(root, 'showrank_recent_purchases/panorama/layout/hud_escape_menu.xml'), 'utf8');
  const pokerXml = fs.readFileSync(path.join(root, 'poker/panorama/layout/hud_escape_menu.xml'), 'utf8');
  const hpXml = fs.readFileSync(path.join(root, 'hp_colors_rewrite_v2/panorama/layout/hud_escape_menu.xml'), 'utf8');

  const merged = mergeEscapeMenuXml(showrankXml, {
    pokerXml,
    hpColorsXml: hpXml,
    enableShowrank: true,
    enablePoker: true,
    enableHpColors: true
  });

  // Scripts & Styles
  assert.match(merged, /showrank_barebones\.vjs_c/, 'includes ShowRank script');
  assert.match(merged, /poker_escape_menu\.vjs_c/, 'includes Poker script');
  assert.match(merged, /poker_escape_menu\.vcss_c/, 'includes Poker stylesheet');
  assert.match(merged, /hp_colors_v2_menu\.vcss_c/, 'includes HP Colors stylesheet');
  assert.match(merged, /hp_colors_v2_contract\.vjs_c/, 'includes HP Colors contract script');
  assert.match(merged, /hp_colors_v2_state\.vjs_c/, 'includes HP Colors state script');
  assert.match(merged, /hp_colors_v2_menu\.vjs_c/, 'includes HP Colors menu script');

  // Menu Buttons
  assert.match(merged, /id="PokerMenuButton"/, 'includes PokerMenuButton');
  assert.match(merged, /id="HPColorsMenuButton"/, 'includes HPColorsMenuButton');

  // Root Dialogs
  assert.match(merged, /id="TableGamePickerWindow"/, 'includes TableGamePickerWindow');
  assert.match(merged, /id="HPColorsEditorRoot"/, 'includes HPColorsEditorRoot');

  // Event Handlers
  assert.match(merged, /onload="[^"]*\$\.ShowRankBarebonesEscapeOpen[^"]*"/, 'preserves ShowRank escape open in onload');
  assert.match(merged, /onload="[^"]*\$\.HPColorsMenuBoot[^"]*"/, 'preserves HPColorsMenuBoot in onload');
  assert.match(merged, /oncancel="[^"]*\$\.HPColorsMenuCancel[^"]*"/, 'includes HPColorsMenuCancel in oncancel');
});

test('assembleCustomPack: stages combined assets with HP Colors v2 and Community Stats', () => {
  const stageDir = path.join(root, '_custom_pack_test_stage');
  
  const result = assembleCustomPack({
    stageSourceDir: stageDir,
    modules: {
      showrank_qol: true,
      hp_colors_v2: true,
      poker: true,
      buff_timer: true,
      hud_3d: true
    }
  });

  assert.equal(result.success, true);

  // ShowRank + QoL + Community Stats
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/citadel_hud_top_bar.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/citadel_hud_top_bar_player.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/citadel_db_page_profile.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/citadel_ui_context_menu_player.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/showrank_barebones.js')), true);

  // Verify community stats was composed into showrank_barebones.js and styles
  const stagedShowRankJs = fs.readFileSync(path.join(stageDir, 'panorama/scripts/showrank_barebones.js'), 'utf8');
  assert.match(stagedShowRankJs, /ProfileStatsCommunity/, 'composed ProfileStatsCommunity into showrank_barebones.js');
  const stagedShowRankCss = fs.readFileSync(path.join(stageDir, 'panorama/styles/showrank_barebones_topbar.css'), 'utf8');
  assert.match(stagedShowRankCss, /ProfileStatsCommunity/, 'composed ProfileStatsCommunity into showrank_barebones_topbar.css');

  // HP Colors v2
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/unit_status_overlay_v2.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/hp_colors_v2_contract.js')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/hp_colors_v2_state.js')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/hp_colors_v2_menu.js')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/unit_status_v2_colors.js')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/unit_status_v2_segment_align.js')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/styles/hp_colors_v2_menu.css')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/styles/unit_status_v2.css')), true);

  // Poker & Table games
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/chat.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/poker_escape_menu.js')), true);

  // Buff timer & 3D HUD
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/rejuvnbufftimer.js')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/3d_hero_dynamic.js')), true);

  // Clean up test stage
  fs.rmSync(stageDir, { recursive: true, force: true });
});
