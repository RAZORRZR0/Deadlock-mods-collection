import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVpk } from '../Show-rank-merger/src/vpkReader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const modDir = path.join(root, 'showrank_recent_purchases');
const vpkPath = path.join(root, 'showrank_recent_purchases_dir.vpk');

test('showrank_recent_purchases: source contract', () => {
  const topbarPlayerXml = fs.readFileSync(path.join(modDir, 'panorama/layout/citadel_hud_top_bar_player.xml'), 'utf8');
  assert.match(topbarPlayerXml, /id="ShowRankBarebonesTopbarRankImage"/, 'topbar player XML includes ShowRank rank image');
  assert.match(topbarPlayerXml, /class="HeroNameHidden"/, 'topbar player XML includes ByteNode HeroNameHidden label');
  assert.match(topbarPlayerXml, /id="ShowRankBarebonesMissingIndicator"/, 'topbar player XML includes missing indicator');
  assert.match(topbarPlayerXml, /class="AlwaysPlayerName"/, 'topbar player XML includes AlwaysPlayerName nickname label');
  assert.match(topbarPlayerXml, /id="UltimateCooldownTextHidden"/, 'topbar player XML includes UltimateCooldownTextHidden label');
  assert.match(topbarPlayerXml, /id="UltimateCooldownTextShown"/, 'topbar player XML includes UltimateCooldownTextShown label');

  const topbarXml = fs.readFileSync(path.join(modDir, 'panorama/layout/citadel_hud_top_bar.xml'), 'utf8');
  assert.match(topbarXml, /id="ShowRankBarebonesTeamAverageLayer"/, 'topbar XML includes ShowRank team average ranks');
  assert.match(topbarXml, /id="ShowRankBarebonesNotificationRoot"/, 'topbar XML includes missing notification toast root');
  assert.match(topbarXml, /id="SpawnNotificationRoot"/, 'topbar XML includes spawn announcement root');
  assert.match(topbarXml, /spawn_announcements\.vjs_c/, 'topbar XML includes spawn announcement script');
  assert.match(topbarXml, /spawn_announcements\.vcss_c/, 'topbar XML includes spawn announcement stylesheet');
  assert.match(topbarXml, /id="UrnTracker"/, 'topbar XML includes UrnTracker soul difference panel');


  const heroShopXml = fs.readFileSync(path.join(modDir, 'panorama/layout/citadel_hud_hero_shop.xml'), 'utf8');
  assert.match(heroShopXml, /recent_purchases_redux\.vjs_c/, 'hero shop XML includes recent purchases runtime');
  assert.match(heroShopXml, /recent_purchases_redux_data\.vjs_c/, 'hero shop XML includes item icon data');
  assert.match(heroShopXml, /id="RecentPurchasesPanel"/, 'hero shop XML includes RecentPurchasesPanel');

  const heroTestingXml = fs.readFileSync(path.join(modDir, 'panorama/layout/hud_hero_testing.xml'), 'utf8');
  assert.match(heroTestingXml, /id="DevConsoleInput"/, 'hero testing XML includes DevConsoleInput');
  assert.match(heroTestingXml, /HeroTesting_HeroControl/, 'hero testing XML includes Hero Control section');

  const showrankJs = fs.readFileSync(path.join(modDir, 'panorama/scripts/showrank_barebones.js'), 'utf8');
  assert.match(showrankJs, /registerMissingRecord\(missingShared,\s*root\)/, 'showrank runtime registers missing records');

  const spawnAnnouncerJs = fs.readFileSync(path.join(modDir, 'panorama/scripts/spawn_announcements.js'), 'utf8');
  assert.match(spawnAnnouncerJs, /sinners_sacrifice/, 'spawn announcements include sinners sacrifice');
  assert.match(spawnAnnouncerJs, /bridge_buffs/, 'spawn announcements include bridge buffs');

  const baseTopbarCss = fs.readFileSync(path.join(modDir, 'panorama/styles/base/citadel_hud_top_bar.css'), 'utf8');
  assert.doesNotMatch(baseTopbarCss, /\.connectedToHideout\s+CitadelHudTopBar\s*\{[^}]*visibility:\s*collapse;/, 'base topbar CSS does not collapse CitadelHudTopBar in hideout');
  assert.match(baseTopbarCss, /\.connectedToHideout\s+\.GameClock/, 'base topbar CSS collapses GameClock in hideout');

  const heroTestingCss = fs.readFileSync(path.join(modDir, 'panorama/styles/hero_testing_menu.css'), 'utf8');
  assert.match(heroTestingCss, /\.connectedToHeroTesting\.connectedToHideout\s+\.hud_hero_testing_root/, 'hero testing menu supports hideout positioning');

  const dmgReportCss = fs.readFileSync(path.join(modDir, 'panorama/styles/hud_damage_report.css'), 'utf8');
  assert.match(dmgReportCss, /\.InHideout\s+\.HudDamageReport/, 'damage report supports hideout positioning');
});

test('showrank_recent_purchases: compiled VPK archive contract', (t) => {
  if (!fs.existsSync(vpkPath)) {
    t.skip('VPK not built yet; run build_showrank_recent_purchases.ps1 to generate and test archive');
    return;
  }
  const vpkBytes = fs.readFileSync(vpkPath);
  const parsed = parseVpk(vpkBytes);
  assert.equal(parsed.files.length, 22, 'VPK contains exactly 22 compiled assets');

  const expectedPaths = [
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
    'panorama/scripts/spawn_announcements.vjs_c',
    'panorama/styles/base/citadel_hud_hero_shop.vcss_c',
    'panorama/styles/base/citadel_hud_top_bar.vcss_c',
    'panorama/styles/citadel_hud_hero_shop.vcss_c',
    'panorama/styles/citadel_hud_top_bar.vcss_c',
    'panorama/styles/hero_testing_menu.vcss_c',
    'panorama/styles/hud_damage_report.vcss_c',
    'panorama/styles/showrank_barebones_topbar.vcss_c',
    'panorama/styles/spawn_announcements.vcss_c'
  ].sort();

  const actualPaths = parsed.files.map(f => f.path).sort();
  assert.deepEqual(actualPaths, expectedPaths, 'VPK archive contains exact expected set of compiled files starting with panorama/');
});
