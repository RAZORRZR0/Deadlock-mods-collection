import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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

export function mergeEscapeMenuXml(baseXml, pokerXml) {
  let result = baseXml;

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

  return result;
}

export function assembleCustomPack(options) {
  const {
    stageSourceDir,
    modules = {
      showrank_qol: true,
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

  if (modules.showrank_qol) {
    const showrankDir = path.join(repoRoot, 'showrank_recent_purchases');
    copyDirSync(path.join(showrankDir, 'panorama'), path.join(stageSourceDir, 'panorama'));
  }

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

    const escapeMenuDest = path.join(stageSourceDir, 'panorama/layout/hud_escape_menu.xml');
    const pokerEscapeMenuSrc = path.join(pokerDir, 'panorama/layout/hud_escape_menu.xml');
    const pokerEscapeXml = fs.existsSync(pokerEscapeMenuSrc) ? fs.readFileSync(pokerEscapeMenuSrc, 'utf8') : '';

    if (fs.existsSync(escapeMenuDest)) {
      const baseXml = fs.readFileSync(escapeMenuDest, 'utf8');
      const mergedXml = mergeEscapeMenuXml(baseXml, pokerEscapeXml);
      fs.writeFileSync(escapeMenuDest, mergedXml, 'utf8');
    } else if (pokerEscapeXml) {
      fs.writeFileSync(escapeMenuDest, pokerEscapeXml, 'utf8');
    }
  }

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

  if (modules.abilities_no_behavior || modules.abilities_yes_behavior) {
    const scriptName = modules.abilities_yes_behavior ? 'active.py' : 'active_no_behavior.py';
    const pyScriptPath = path.join(repoRoot, 'abilities/scripts', scriptName);
    const vdataSrc = path.join(repoRoot, 'abilities/scripts/abilities.vdata');
    const vdataDest = path.join(stageSourceDir, 'scripts/abilities.vdata');
    fs.mkdirSync(path.dirname(vdataDest), { recursive: true });

    let pyCmd = 'py';
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
  let selected = 'showrank_qol,abilities_yes_behavior,buff_timer';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stage' && args[i + 1]) stageDir = args[i + 1];
    if (args[i] === '--modules' && args[i + 1]) selected = args[i + 1];
  }

  const list = selected.split(',').map((s) => s.trim().toLowerCase());
  const modules = {
    showrank_qol: list.includes('showrank') || list.includes('showrank_qol') || list.includes('qol') || list.includes('1'),
    poker: list.includes('poker') || list.includes('2'),
    abilities_no_behavior: list.includes('abilities_no_behavior') || list.includes('active_no_filter') || list.includes('pak05') || list.includes('3'),
    abilities_yes_behavior: list.includes('abilities_yes_behavior') || list.includes('active_yes_filter') || list.includes('pak03') || list.includes('4'),
    buff_timer: list.includes('buff_timer') || list.includes('buff') || list.includes('5'),
    hud_3d: list.includes('hud_3d') || list.includes('3d') || list.includes('6')
  };

  const result = assembleCustomPack({
    stageSourceDir: stageDir,
    modules
  });

  console.log(JSON.stringify(result));
}
