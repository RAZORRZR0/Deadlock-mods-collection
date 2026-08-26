import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVpk } from '../Show-rank-merger/src/vpkReader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const modDir = path.join(root, 'testing_tools');
const vpkPath = path.join(root, 'testing_tools_dir.vpk');

test('testing_tools: source contract', () => {
  const xml = fs.readFileSync(path.join(modDir, 'panorama/layout/hud_hero_testing.xml'), 'utf8');
  assert.match(xml, /id="DevConsoleInput"/, 'layout contains DevConsoleInput');
  assert.match(xml, /HeroTesting_HeroTools/, 'layout contains Hero Tools section');
  assert.match(xml, /HeroTesting_GameRules|Game Rules/, 'layout contains Game Rules section');
  assert.match(xml, /Play \&amp; Watch|CitadelShowPlayPage/, 'layout contains Play & Watch section');
  assert.match(xml, /HeroTesting_HeroControl/, 'layout contains Hero Control section');
  assert.match(xml, /id="SpawnBotCard"/, 'layout contains SpawnBotCard selector');
  assert.match(xml, /id="DisableDeathCheckbox"/, 'layout contains DisableDeathCheckbox');
  assert.match(xml, /id="EnableUnlimitedAmmoCheckbox"/, 'layout contains EnableUnlimitedAmmoCheckbox');
  assert.match(xml, /id="DisableCooldownCheckbox"/, 'layout contains DisableCooldownCheckbox');
  assert.match(xml, /id="EnableFastStaminaCheckbox"/, 'layout contains EnableFastStaminaCheckbox');
  assert.match(xml, /id="LaneChallengePanel"/, 'layout contains LaneChallengePanel');

  const js = fs.readFileSync(path.join(modDir, 'panorama/scripts/hud_hero_testing.js'), 'utf8');
  assert.match(js, /DevConsoleSubmit/, 'script defines DevConsoleSubmit');
  assert.match(js, /CitadelConCommand/, 'script dispatches CitadelConCommand');

  const css = fs.readFileSync(path.join(modDir, 'panorama/styles/hero_testing_menu.css'), 'utf8');
  assert.match(css, /\.dev_console_input/, 'css styles dev_console_input');
  assert.match(css, /#hero_testing_stub/, 'css styles hero_testing_stub');
});

test('testing_tools: compiled VPK archive contract', (t) => {
  if (!fs.existsSync(vpkPath)) {
    t.skip('VPK not built yet; run build_testing_tools.ps1 to generate and test archive');
    return;
  }
  const vpkBytes = fs.readFileSync(vpkPath);
  const parsed = parseVpk(vpkBytes);
  assert.equal(parsed.files.length, 3, 'VPK contains exactly 3 compiled assets');

  const expectedPaths = [
    'panorama/layout/hud_hero_testing.vxml_c',
    'panorama/scripts/hud_hero_testing.vjs_c',
    'panorama/styles/hero_testing_menu.vcss_c'
  ].sort();

  const actualPaths = parsed.files.map(f => f.path).sort();
  assert.deepEqual(actualPaths, expectedPaths, 'VPK archive contains exact expected set of compiled files starting with panorama/');
});
