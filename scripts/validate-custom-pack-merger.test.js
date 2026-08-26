import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeEscapeMenuXml, assembleCustomPack } from './merge-custom-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

test('mergeEscapeMenuXml: combines ShowRank and Poker', () => {
  const showrankXml = fs.readFileSync(path.join(root, 'showrank_recent_purchases/panorama/layout/hud_escape_menu.xml'), 'utf8');
  const pokerXml = fs.readFileSync(path.join(root, 'poker/panorama/layout/hud_escape_menu.xml'), 'utf8');

  const merged = mergeEscapeMenuXml(showrankXml, pokerXml);

  assert.match(merged, /showrank_barebones\.vjs_c/, 'includes ShowRank script');
  assert.match(merged, /poker_escape_menu\.vjs_c/, 'includes Poker script');
  assert.match(merged, /poker_escape_menu\.vcss_c/, 'includes Poker stylesheet');
  assert.match(merged, /id="PokerMenuButton"/, 'includes PokerMenuButton');
  assert.match(merged, /id="TableGamePickerWindow"/, 'includes TableGamePickerWindow');
  assert.match(merged, /CitadelHudEscapeMenu oncancel="CitadelResumePlaying\(\)" onload="if \(\$\.ShowRankBarebonesEscapeOpen\)/, 'preserves ShowRank escape hooks');
});

test('assembleCustomPack: stages combined assets', () => {
  const stageDir = path.join(root, '_custom_pack_test_stage');
  
  const result = assembleCustomPack({
    stageSourceDir: stageDir,
    modules: {
      showrank_qol: true,
      poker: true,
      buff_timer: true,
      hud_3d: true
    }
  });

  assert.equal(result.success, true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/citadel_hud_top_bar.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/citadel_hud_top_bar_player.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/chat.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/layout/hud_escape_menu.xml')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/showrank_barebones.js')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/poker_escape_menu.js')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/rejuvnbufftimer.js')), true);
  assert.equal(fs.existsSync(path.join(stageDir, 'panorama/scripts/3d_hero_dynamic.js')), true);

  // Clean up test stage
  fs.rmSync(stageDir, { recursive: true, force: true });
});
