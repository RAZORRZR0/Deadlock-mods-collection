// Detailed Post Scoreboard Menu (pak11) validator.
// The board is a fork of Observer HUD's post-game board (observer_hud pg_*) without the observer extras.
// This file is adapted from the board part of observer_hud/scripts/validate-observer-hud.js; observer_hud
// is never edited for this mod. It runs the board in the same synthetic Panorama VM (the dashboard page,
// its reused scoreboard rows and the stock graph tooltip) and checks:
//  1. the pak loads only its own files (detailed_postgame/ paths), and the page override is the pinned
//     stock page plus the loader include minus the flame video src;
//  2. it builds when the match loads and again for the next match on the reused rows, never twice;
//  3. it is cheap while hidden and little while shown; a reopen without events is still found;
//  4. a layout reload keeps one loop and one listener;
//  5. the scan reads souls by source and the soul lead from the stock tooltip, never drawing it meanwhile;
//  6. none of the observer extras is left: no web page, no handoff listener, stock team names only.
// DPS_CHECK=<text> runs only matching checks. Writes .tmp/detailed-postgame-validate.json.
// It proves no rendering or CSS behaviour; that needs the game.
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { MockPanel, createPanoramaHarness, createVmContext, runInVm } =
  require("../../scripts/hp-colors-panorama-test-adapter.js");
// UICanvas (client.dll 6819, ui_canvas.cpp, static RE): ClearJS(color) and
// DrawSoftLinePointsJS(nPoints, [x0, y0, x1, y1, ...], thickness, softness, color); a bad colour draws white.
// The board's save page (hpv2-store dps/v1/, the row layout) runs behind a fake CEF panel, as Observer HUD's
// validator runs its store pages: SetURL with the page URL runs the real page script against a disk object that
// survives simulated restarts (pass the same disk to the next boardWorld); its title comes back through the
// panel's HTMLTitle handler 50 ms later. web.offline: every load leaves a dead page (no answer).
const PREFS_PAGE = process.env.DPS_PREFS_PAGE || "D:/hpv2-store/dps/v1/index.html";
const PREFS_URL = "https://hantu-raya.github.io/hpv2-store/dps/v1/";
if (!fs.existsSync(PREFS_PAGE)) {
  console.error(`not ok - the save page is missing: ${PREFS_PAGE} (clone Hantu-Raya/hpv2-store there, or set DPS_PREFS_PAGE)`);
  process.exit(1);
}
const PAGE_SCRIPTS = { [PREFS_URL]: /<script>([\s\S]*)<\/script>/.exec(fs.readFileSync(PREFS_PAGE, "utf8"))[1] };
MockPanel.prototype.SetURL = function (url) {
  let root = this;
  while (root.GetParent()) root = root.GetParent();
  const web = root.__web;
  if (!web) return true;
  (web.urls = web.urls || []).push(String(url));
  const base = String(url).split("#")[0];
  if (!PAGE_SCRIPTS[base]) { this.__page = null; return true; }
  const panel = this;
  if (panel.__page && panel.__page.base !== base) panel.__page = null;
  if (panel.__page && panel.__page.dead) return true;
  if (!panel.__page && web.offline) { panel.__page = { dead: true, base }; return true; }
  if (!panel.__page) {
    const page = { title: "", hash: "", href: url, base, listeners: [] };
    page.sandbox = {
      window: { addEventListener: (name, fn) => { if (name === "hashchange") page.listeners.push(fn); } },
      location: { get hash() { return page.hash; }, get href() { return page.href; } },
      document: { set title(value) { page.title = value; if (web.inXhr && panel.__page === page) emitTitle(panel, web); }, get title() { return page.title; } },
      localStorage: {
        getItem: (key) => Object.prototype.hasOwnProperty.call(web.disk, key) ? web.disk[key] : null,
        setItem: (key, value) => { web.disk[key] = String(value); },
        removeItem: (key) => { delete web.disk[key]; }
      },
      JSON, Math, Error, String, Array, Object, decodeURIComponent, XMLHttpRequest: pageXhr(web)
    };
    page.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    panel.__page = page;
    vm.runInNewContext(PAGE_SCRIPTS[base], page.sandbox);
    emitTitle(panel, web);
    return true;
  }
  panel.__page.href = url;
  panel.__page.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
  for (const fn of panel.__page.listeners) fn();
  emitTitle(panel, web);
  return true;
};
// The save page's deadlock-api request (op "it", XMLHttpRequest): web.api = { [match id]: metadata } answers after
// web.apiDelay ms (default 800); a match not in it is a 404; web.apiDown: a network error. web.apiCalls lists the
// fetches. A title the page sets from a reply reaches the panel's HTMLTitle as any other (CEF reports each change).
function pageXhr(web) {
  return function XMLHttpRequest() {
    const x = this;
    x.open = (method, url) => { x.url = String(url); };
    x.send = () => {
      (web.apiCalls = web.apiCalls || []).push(x.url);
      web.harness.scheduler.schedule((web.apiDelay === undefined ? 800 : web.apiDelay) / 1000, () => {
        web.inXhr = true;
        try {
          if (web.apiDown) { if (x.onerror) x.onerror(); return; }
          const id = (/matches\/(\d+)\/metadata$/.exec(x.url) || [])[1];
          const data = web.api && id ? web.api[id] : null;
          x.status = data ? 200 : 404;
          x.responseText = data ? JSON.stringify(data) : "{}";
          if (x.onload) x.onload();
        } finally {
          web.inXhr = false;
        }
      });
    };
  };
}
// The stock item tooltip (live 6864, detailed_postgame/live/20261123-item-icons-probe-6864.log): an icon's
// DispatchPanelEvent onmouseover fills CitadelModDetailsTooltip (under TooltipManager, under the window root) one
// frame later, its first label the item's name (icon.__itemName); onmouseout leaves it showing. itemTip.frames
// counts the frames it showed while TooltipManager was not at opacity 0 (it would have flashed on screen).
function itemTooltip(root, harness) {
  const itemTip = { frames: 0, shows: 0 };
  const layer = new MockPanel("Panel", root, "TooltipManager"); // there from the start; the item tooltip on first use
  let tip = null;
  let label = null;
  itemTip.hover = (icon, event) => {
    if (event !== "onmouseover") return;
    if (!tip) {
      tip = new MockPanel("Panel", layer, "CitadelModDetailsTooltip");
      label = new MockPanel("Label", tip, "");
      new MockPanel("Label", tip, "").text = "Owned";
    }
    if (!icon.__itemName) return; // an empty slot: the stock tooltip keeps showing the last item
    harness.scheduler.schedule(0, () => {
      label.text = icon.__itemName;
      tip.visible = true;
      itemTip.shows++;
      if (layer.style.opacity !== "0") itemTip.frames++;
    });
  };
  itemTip.layer = () => layer;
  return itemTip;
}
// Item class name -> the name $.Localize gives (the game's citadel_gc_mod_names), for the purchase-time checks.
const ITEM_LOC = { "#upgrade_medic_bullets": "Restorative Shot", "#upgrade_close_range": "Close Quarters",
  "#upgrade_healbane": "Healbane", "#upgrade_berserker": "Berserker", "#upgrade_rupture": "Decay" };
// deadlock-api's item id: MurmurHash2 (seed 0x31415926) of the class name (detailed_postgame/scripts/gen-item-names.js).
function itemId(name) {
  const data = Buffer.from(name, "utf8");
  const m = 0x5bd1e995;
  let h = (0x31415926 ^ data.length) >>> 0;
  let i = 0;
  let len = data.length;
  for (; len >= 4; i += 4, len -= 4) {
    let k = data.readUInt32LE(i);
    k = Math.imul(k, m);
    k ^= k >>> 24;
    k = Math.imul(k, m);
    h = Math.imul(h, m) ^ k;
  }
  if (len === 3) h ^= data[i + 2] << 16;
  if (len >= 2) h ^= data[i + 1] << 8;
  if (len >= 1) { h ^= data[i]; h = Math.imul(h, m); }
  h ^= h >>> 13;
  h = Math.imul(h, m);
  h ^= h >>> 15;
  return h >>> 0;
}
function emitTitle(panel, web) {
  const title = String(panel.__page.title).slice(0, 4096); // the game cuts HTMLTitle at 4096 characters
  web.harness.scheduler.schedule(0.05, () => {
    if (panel.events.HTMLTitle) panel.events.HTMLTitle(panel, title);
    for (const fn of ((panel.__handlers || {}).HTMLTitle || []).slice()) fn(panel, title);
  });
}
MockPanel.prototype.ClearJS = function (color) { this.__draws = []; this.__clear = color; };
MockPanel.prototype.DrawSoftLinePointsJS = function (n, points, thickness, softness, color) {
  (this.__draws = this.__draws || []).push({ n, pts: Array.from(points), thickness, softness, color });
};
const plain = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const deq = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);
MockPanel.prototype.SetHeroID = function (id) { this.heroId = id; };
MockPanel.prototype.BHasKeyFocus = function () { return !!this.keyFocus; };

const MODULE = path.join(__dirname, "..");
const REPO = path.join(MODULE, "..");
const read = (rel) => fs.readFileSync(path.join(MODULE, rel), "utf8").replace(/\r\n/g, "\n");
const script = (name) => read(`panorama/scripts/detailed_postgame/${name}`);
const results = { checks: [], runs: [], budgets: null };

// (P0 probe, client 6819, 20k-call loops). Raw calls are still printed beside them. GetChildCount
// (formerly "traversal" only) and Children()'s child wrappers now count; subtree node visits are
// priced per node.
const WEIGHT_NS = {
  boundaryValidityCalls: 50, classReads: 400, classWrites: 1150, textReads: 225, textWrites: 750, styleReads: 650,
  styleWrites: 1150, parentReads: 325, childrenReads: 350, childWrappers: 140, childCountReads: 200,
  layoutWidthReads: 250, positions: 1000, schedules: 1000, boundaryQueries: 350, nodeVisits: 10, moveChildCalls: 1000,
  parentWrites: 1000, cancellations: 1000, other: 400
};
const RAW_EXCLUDED = new Set(["childWrappers", "nodeVisits"]);
// The post-game board (plan phase 2): at most 11 native calls per second while its page shows and
// nothing changes; while hidden one visibility check a second (a reopen can bring no event, live).
const BUDGET_BOARD = { calls: 12, us: 3, hiddenUs: 2 }; // 12: the fit check reads the page width once per 1 s check while shown
const ATTRIB = { on: !!process.env.DPS_ATTRIB, map: new Map() };

let lastLogs = null;
// Engine model (ENGINE.md, live 2026-10-23): after style.visibility = "collapse", writing null clears the
// inline value but the panel stays hidden. Every check fails if any panel of its worlds got that sequence.
const WORLDS = [];
function stuckHidden() {
  const stuck = [];
  const visit = (panel) => {
    let collapsed = false;
    for (const { property, value } of panel.__styleWrites || []) {
      if (property !== "visibility") continue;
      if (value === "collapse") collapsed = true;
      else if (value === null && collapsed) stuck.push(panel.id || panel.paneltype);
      else if (value) collapsed = false;
    }
    for (const child of panel.children || []) visit(child);
  };
  for (const root of WORLDS) visit(root);
  return [...new Set(stuck)];
}
// Live (DLF on client 6819, 2026-10-24) a panel never laid out reads Infinity from
// GetPositionWithinWindow, and a style value with NaN or Infinity throws "Invalid value for property".
// The mock accepts anything, so every check fails on such a write instead.
function invalidStyles() {
  const bad = [];
  const visit = (panel) => {
    for (const { property, value } of panel.__styleWrites || []) {
      if (typeof value === "string" && /NaN|Infinity|undefined/.test(value)) bad.push(`${panel.id || panel.paneltype}.${property}=${value}`);
    }
    for (const child of panel.children || []) visit(child);
  };
  for (const root of WORLDS) visit(root);
  return [...new Set(bad)];
}

function check(name, fn) {
  if (process.env.DPS_CHECK && !name.includes(process.env.DPS_CHECK)) return;
  WORLDS.length = 0;
  try {
    fn();
    const stuck = stuckHidden();
    assert.deepEqual(stuck, [], `visibility collapse then null leaves these hidden live: ${stuck.join(", ")}`);
    const bad = invalidStyles();
    assert.deepEqual(bad, [], `these style values throw live: ${bad.join(", ")}`);
  } catch (error) {
    console.log(`not ok - ${name}\n  last logs:\n    ${(lastLogs || []).slice(-25).join("\n    ")}`);
    throw error;
  }
  results.checks.push(name);
  console.log(`ok - ${name}`);
}

// ---------------------------------------------------------------- layouts -> mock panels

function parseLayout(xml) {
  const body = xml.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(styles|scripts|snippets)>[\s\S]*?<\/\1>/g, "")
    .replace(/<\/?root>/g, "");
  const stack = [{ children: [] }];
  for (const [, close, type, attrs, selfClose] of body.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    if (close) { stack.pop(); continue; }
    const node = { type, attrs: {}, children: [] };
    for (const [, key, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) node.attrs[key] = value;
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  assert.equal(stack.length, 1, "unbalanced layout XML");
  return stack[0].children[0];
}

const classesOf = (node) => (node.attrs.class || "").split(/\s+/).filter(Boolean);
function instantiate(node, parent) {
  const panel = new MockPanel(node.type, parent, node.attrs.id || "");
  panel.classes = classesOf(node);
  if ("text" in node.attrs) panel.__text = node.attrs.text;
  if ("placeholder" in node.attrs) panel.placeholder = node.attrs.placeholder;
  for (const child of node.children) instantiate(child, panel);
  return panel;
}
// A layout loaded into an existing panel: the panel takes the root's classes, the root's children become its own.
function loadInto(panel, node) {
  for (const cls of classesOf(node)) panel.AddClass(cls);
  for (const child of node.children) instantiate(child, panel);
  return panel;
}
const findAll = (panel, type, out = []) => {
  if (panel.paneltype === type) out.push(panel);
  for (const child of panel.children) findAll(child, type, out);
  return out;
};

// ---------------------------------------------------------------- native cost metric

let lastNodes = 0; // subtree node visits of the last counted window
// Counts every crossing the scripts make, including the ones the shared adapter books only as
// "traversal" (GetChildCount) and the child wrappers Children() allocates (live P0: about 140 ns each).
// DPS_ATTRIB=1 prints the weighted cost per script function for each counted window (dev aid).
const blame = (key, n) => {
  if (!ATTRIB.on || !(n > 0)) return;
  const match = /at (\S+) \(((?:oh|pg)_[a-z_]+\.js):(\d+)/.exec(new Error().stack || "");
  const where = match ? `${match[2]} ${match[1]}` : "(adapter/other)";
  ATTRIB.map.set(where, (ATTRIB.map.get(where) || 0) + n * (WEIGHT_NS[key] ?? WEIGHT_NS.other));
};
const counted = (harness) => {
  let positions = 0;
  let childCountReads = 0;
  let childWrappers = 0;
  const proto = MockPanel.prototype;
  const position = proto.GetPositionWithinWindow;
  const childCount = proto.GetChildCount;
  const childrenOf = proto.Children;
  ATTRIB.map = new Map();
  if (ATTRIB.on) {
    const counts = harness.operationCounts;
    for (const key of Object.keys(WEIGHT_NS).concat(["findTraversals", "classTraversalNodes"])) {
      let value = counts[key] || 0;
      Object.defineProperty(counts, key, { configurable: true, enumerable: true, get: () => value,
        set: (next) => { blame(key === "findTraversals" || key === "classTraversalNodes" ? "nodeVisits" : key, next - value); value = next; } });
    }
  }
  proto.GetPositionWithinWindow = function () {
    positions++;
    blame("positions", 1);
    const { parentReads, boundaryValidityCalls } = harness.operationCounts;
    const result = position.call(this);
    Object.assign(harness.operationCounts, { parentReads, boundaryValidityCalls });
    return result;
  };
  proto.GetChildCount = function () {
    childCountReads++;
    blame("childCountReads", 1);
    return childCount.call(this);
  };
  proto.Children = function () {
    const list = childrenOf.call(this);
    childWrappers += list.length;
    blame("childWrappers", list.length);
    return list;
  };
  return () => {
    proto.GetPositionWithinWindow = position;
    proto.GetChildCount = childCount;
    proto.Children = childrenOf;
    const ops = Object.assign({}, harness.operationCounts, { positions, childCountReads, childWrappers });
    lastNodes = (ops.findTraversals || 0) + (ops.classTraversalNodes || 0);
    for (const key of ["traversal", "findTraversals", "classTraversalNodes"]) delete ops[key];
    ops.nodeVisits = lastNodes;
    if (ATTRIB.on) {
      const top = [...ATTRIB.map].sort((a, b) => b[1] - a[1]).slice(0, 25);
      console.log(`   [attrib] top functions, us/s over a 10 s window:\n${top.map(([where, ns]) => `     ${(ns / 1e4).toFixed(1).padStart(6)}  ${where}`).join("\n")}`);
    }
    return Object.fromEntries(Object.entries(ops).filter(([, value]) => value));
  };
};
const per = (ops, seconds) => Object.fromEntries(Object.entries(ops).map(([key, value]) => [key, Math.round(value / seconds * 10) / 10]));
// Raw calls: every JS<->native crossing (child wrappers and subtree node visits are not crossings).
const total = (ops) => Math.round(Object.entries(ops).reduce((sum, [key, value]) => sum + (RAW_EXCLUDED.has(key) ? 0 : value), 0) * 10) / 10;
// Weighted: microseconds of native time per second, from the live per-call costs (P0).
const weighted = (ops) => Math.round(Object.entries(ops).reduce((sum, [key, value]) => sum + value * (WEIGHT_NS[key] ?? WEIGHT_NS.other), 0) / 100) / 10;
const reset = (w) => { for (const key of Object.keys(w.harness.operationCounts)) w.harness.operationCounts[key] = 0; };


check("board: torn paper surfaces use their own full-strength mask at their own size, no faint frame or light border is left", () => {
  // User 2026-10-26: dark edges around the header plates and the graph, and nothing looked like torn paper.
  // opacity-mask reads alpha (live); the stock rough_edge masks have alpha 255 everywhere and masked nothing.
  // How it could fail: a partial-strength mask leaves a faint frame; a mask is stretched to another size; a
  // light rim comes back (user 2026-10-26: "I hate this light brown border"); an image is not shipped.
  const css = read("panorama/styles/detailed_postgame/pg_board.css");
  const board = read("panorama/layout/detailed_postgame/pg_board.xml");
  const column = read("panorama/layout/detailed_postgame/pg_column.xml");
  for (const m of css.matchAll(/opacity-mask:\s*url\("s2r:\/\/panorama\/images\/([\w/]+)\.vtex"\)\s*([\d.]+)?/g)) {
    if (m[1] === "post_game/hero_logo_mask_psd") continue; // the wordmark's diagonal fade, meant to be partial
    assert.equal(m[2] === undefined ? 1 : Number(m[2]), 1, `${m[1]} is used at full strength`);
  }
  const body = (sel) => {
    const found = new RegExp(`\\n${sel.replace(/[.#]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(found, `${sel} has a rule`);
    return found[1];
  };
  const px = (sel, prop) => Number(new RegExp(`(?:^|\\n)\\s*${prop}:\\s*(\\d+)px`).exec(body(sel))[1]);
  const size = (image) => {
    const png = fs.readFileSync(path.join(MODULE, "panorama", "images", "detailed_postgame", `${image}.png`));
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  // [surface rule, mask, rule giving the width, rule giving the height]
  const surfaces = [
    [".NSHeadLeft", "torn_head_l", ".NSHeadSide", ".NSHeader"],
    [".NSHeadRight", "torn_head_r", ".NSHeadSide", ".NSHeader"],
    [".NSAward", "torn_award", ".NSAward", ".NSAward"],
    [".NSGraphPlot", "torn_graph", ".NSGraphPlot", ".NSGraphPlot"],
    [".NSProgressTrack", "torn_track", ".NSProgressTrack", ".NSProgressTrack"]
  ];
  for (const [sel, mask, wSel, hSel] of surfaces) {
    assert.match(body(sel), new RegExp(`opacity-mask:\\s*url\\("s2r://panorama/images/detailed_postgame/${mask}\\.vtex"\\)\\s*1;`), `${sel} uses ${mask}`);
    deq(size(mask), [px(wSel, "width"), px(hSel, "height")], `${mask} is drawn at ${sel}'s size`);
  }
  assert.ok(!/opacity-mask/.test(body(".NSPaper")), ".NSPaper (the stat columns) is not torn (user 2026-10-26)");
  for (const [name, text] of [["pg_board.css", css], ["pg_board.xml", board], ["pg_column.xml", column]]) assert.ok(!/TornRim|_rim\.vtex/.test(text), `${name}: no light rim over the tears`);
  // An RGBA8 PNG's pixels (the generator writes 8-bit RGBA, not interlaced).
  const pixels = (image) => {
    const png = fs.readFileSync(path.join(MODULE, "panorama", "images", "detailed_postgame", `${image}.png`));
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.deepEqual([png[24], png[25], png[28]], [8, 6, 0], `${image}.png is 8-bit RGBA, not interlaced`);
    const idat = [];
    for (let at = 8; at < png.length;) {
      const len = png.readUInt32BE(at);
      if (png.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len));
      at += 12 + len;
    }
    const raw = require("zlib").inflateSync(Buffer.concat(idat));
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const filter = raw[y * (w * 4 + 1)];
      for (let i = 0; i < w * 4; i++) {
        const x = raw[y * (w * 4 + 1) + 1 + i];
        const a = i >= 4 ? out[y * w * 4 + i - 4] : 0;
        const b = y > 0 ? out[(y - 1) * w * 4 + i] : 0;
        const c = i >= 4 && y > 0 ? out[(y - 1) * w * 4 + i - 4] : 0;
        const p = a + b - c;
        const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
        out[y * w * 4 + i] = (x + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
      }
    }
    return { w, h, out };
  };
  // Objective drop lines: one panel each, outside the paper, ending 4 px into the icons (user 2026-10-29).
  {
    const js = read("panorama/scripts/detailed_postgame/pg_board.js");
    const end = Number(/const STEM_END = (\d+);/.exec(js)[1]);
    assert.equal(px(".NSGraphStems", "height"), end, ".NSGraphStems is STEM_END tall");
    assert.equal(end, px(".NSGraphPlot", "height") + px(".NSGraphTicks", "height") + 4, "the stems reach 4 px into the icons");
  }
  // Nothing that reaches past the paper may be cut (user 2026-11-13: drop lines below the paper and the final-lead
  // pill past its right edge were missing): the plot's opacity-mask cuts all its children to the torn paper, and a
  // panel's own box clips (rect( 0%, 100%, 100%, 0% ) is that box), so the marks are a noclip sibling of the plot
  // and the wipe ends with no clip.
  {
    const xml = read("panorama/layout/detailed_postgame/pg_board.xml");
    const js = read("panorama/scripts/detailed_postgame/pg_board.js");
    const plotAt = xml.indexOf('<Panel id="NSGraphPlot"');
    const drawAt = xml.indexOf('<Panel id="NSGraphDraw"');
    assert.ok(plotAt >= 0 && drawAt > plotAt, "NSGraphDraw follows NSGraphPlot in the layout");
    const plotXml = xml.slice(plotAt, drawAt);
    const opens = (plotXml.match(/<Panel\b(?:[^>]*[^\/>])?>/g) || []).length;
    assert.equal(opens, (plotXml.match(/<\/Panel>/g) || []).length, "NSGraphPlot is closed before NSGraphDraw: the marks are not inside the masked paper");
    assert.ok(plotXml.includes('id="NSGraphCanvas"'), "the line canvas stays on the masked paper");
    const drawXml = xml.slice(drawAt, xml.indexOf("</Panel>\n\t\t\t\t<!--", drawAt));
    for (const id of ["NSGraphMarks", "NSGraphPeak1", "NSGraphPeak2", "NSGraphEnd"]) assert.ok(drawXml.includes(`id="${id}"`), `${id} is in NSGraphDraw`);
    assert.ok(/opacity-mask:/.test(body(".NSGraphPlot")), "(the plot is the masked panel)");
    assert.ok(!/opacity-mask:/.test(body(".NSGraphDraw")), "NSGraphDraw has no mask");
    for (const sel of [".NSGraph", ".NSGraphDraw", ".NSGraphStems"]) assert.match(body(sel), /overflow:\s*noclip;/, `${sel} does not clip what passes its box`);
    assert.match(body(".NSGraphDraw"), /ignore-parent-flow:\s*true;/, "NSGraphDraw lies over the plot");
    assert.equal(px(".NSGraphDraw", "width"), px(".NSGraphPlot", "width"), "NSGraphDraw is as wide as the plot");
    assert.equal(px(".NSGraphDraw", "height"), px(".NSGraphPlot", "height"), "NSGraphDraw is as tall as the plot");
    assert.ok(/style\.clip = f >= 1 \? "none" :/.test(js), "the wipe ends with clip none");
    assert.ok(!/f >= 1 \? "rect/.test(js), "no full-box clip is left after the wipe");
  }
  for (const mask of ["torn_head_l", "torn_head_r", "torn_graph", "torn_track", "torn_award"]) {
    // The mask is in alpha as well as grey (live: a mask with alpha 255 everywhere masked nothing).
    const m = pixels(mask);
    for (let i = 0; i < m.w * m.h; i++) assert.equal(m.out[i * 4 + 3], m.out[i * 4], `${mask}: alpha follows the grey`);
    assert.ok(m.out[0] < 128 && m.out[(m.w * m.h - 1) * 4] < 128, `${mask}'s corners are torn away (at most a fibre)`);
  }
});

check("board: ids the scripts look up exist in their layouts; classes they set have rules", () => {
  const board = read("panorama/layout/detailed_postgame/pg_board.xml");
  const column = read("panorama/layout/detailed_postgame/pg_column.xml");
  const js = read("panorama/scripts/detailed_postgame/pg_board.js");
  const css = read("panorama/styles/detailed_postgame/pg_board.css");
  const idsIn = (xml) => new Set([...xml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const boardIds = idsIn(board);
  const used = new Set();
  for (const m of js.matchAll(/ctx\.FindChildTraverse\(`?"?([A-Za-z0-9]+)(\$\{i\})?/g)) {
    if (m[2]) for (const i of [1, 2]) used.add(`${m[1]}${i}`);
    else used.add(m[1]);
  }
  assert.ok(used.size >= 12, `only ${used.size} board lookups parsed`);
  for (const id of used) assert.ok(boardIds.has(id), `#${id} missing from pg_board.xml`);
  const columnIds = idsIn(column);
  const columnUsed = [...js.matchAll(/column\.FindChildTraverse\("([A-Za-z0-9]+)"\)/g)].map((m) => m[1]);
  assert.ok(columnUsed.length >= 4, `only ${columnUsed.length} column lookups parsed`);
  for (const id of columnUsed) assert.ok(columnIds.has(id), `#${id} missing from pg_column.xml`);
  // Panels created under a stock row take the scoreboard's sheets (live), so the column layout includes ours.
  for (const xml of [board, column]) assert.ok(xml.includes("s2r://panorama/styles/detailed_postgame/pg_board.vcss_c"), "board stylesheet included");
  assert.match(read("panorama/scripts/detailed_postgame/pg_loader.js"), /"file:\/\/\{resources\}\/layout\/detailed_postgame\/pg_board\.xml"/);
  assert.match(js, /"file:\/\/\{resources\}\/layout\/detailed_postgame\/pg_column\.xml"/);
  const rules = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  const set = new Set();
  for (const m of js.matchAll(/class: "([^"$]+)"/g)) m[1].split(/\s+/).forEach((c) => set.add(c));
  for (const m of js.matchAll(/(?:AddClass|SetHasClass|RemoveClass)\("([A-Za-z0-9_]+)"/g)) set.add(m[1]);
  for (const key of ["souls", "kills", "assists", "pdmg", "odmg", "heal"]) set.add(`NSBest_${key}`);
  for (const key of ["troopers", "neutrals", "breakables", "bonus", "kills", "objectives", "urn", "assists", "denies"]) set.add(`NSSrc_${key}`);
  for (const c of set) assert.ok(rules.has(c), `.${c} has no rule in pg_board.css`);
});

// ---------------------------------------------------------------- post-game board (dashboard context)
// The board runs in the dashboard, in the post-game page override: pg_loader.js in CitadelPostGameNew
// loads pg_board.xml (and pg_board.js) into #NSHost in #ScoreboardScreen. The engine side is modelled
// from live (client 6819, 2026-10-25; ENGINE.md "Post-game page"):
//  - the page layout loads on the first citadel_match_details; CitadelMatchDetailsUpdated arrives as an
//    unhandled event about 0.5 s later, and CitadelPostGameSelectScreenIndex as a page event when a
//    screen is picked; the dashboard sets PageVisible on the shown page;
//  - C++ clones the scoreboard rows (six players and a TotalsRow per team) and reuses them when the
//    next match opens; a label's {i:...}/{s:...} parts resolve from the row's (or page's) dialog
//    variables in the same frame, integers comma-formatted;
//  - the graph's columns are not modelled (no scan here; verify-postgame-live.js covers it live).
//
// How the board can fail, each with a check below:
//  1. it polls while nobody looks at the page (cost while hidden) or too often while shown;
//  2. it misses the match (an event before the page shows, a load without an event) or builds twice;
//  3. a reused row set keeps the old match on screen;
//  4. a layout reload leaves two loops or two match listeners;
//  5. the entrance replays late when the Scoreboard screen is picked.
const PG = {
  page: parseLayout(read("panorama/layout/post_game/citadel_db_page_post_game_new.xml")),
  board: parseLayout(read("panorama/layout/detailed_postgame/pg_board.xml")),
  column: parseLayout(read("panorama/layout/detailed_postgame/pg_column.xml"))
};
const PG_SCREENS = ["Team1Screen", "Team2Screen", "ScoreboardScreen", "GraphsScreen"];
const PG_HEROES = [[1, 2, 3, 4, 6, 7], [8, 10, 11, 12, 13, 14]];
const PG_STATS = ["net_worth", "player_kills", "player_deaths", "player_assists", "player_dmg", "obj_dmg", "player_healing",
  "player_healing_healing", "player_healing_barriering"]; // the last two: the scoreboard's healing split (SUPPORT)
function pgMatch(id, { swap = false, win = 1 } = {}) {
  const teams = PG_HEROES.map((heroes, t) => heroes.map((hero, k) => ({
    hero: swap ? PG_HEROES[1 - t][k] : hero, account: String(100000 + (id % 1000) * 20 + t * 6 + k),
    net_worth: 20000 + 1000 * k + 77 * t + (id % 97), player_kills: k + t, player_deaths: 6 - k, player_assists: 10 + k,
    player_dmg: 15000 + 500 * k, obj_dmg: 3000 + 100 * k, player_healing: 2000 + 50 * k,
    player_healing_healing: 2000 - 50 * k, player_healing_barriering: 100 * k
  })));
  return { id: String(id), minutes: 31, seconds: 7, win, teams };
}
// A label text as the engine resolves it: every {s:key} / {i:key} part from the nearest ancestor that
// has the dialog variable; an unresolved part stays as written.
function bindAll(label, value) {
  let literal = String(value);
  Object.defineProperty(label, "__text", { configurable: true, enumerable: false,
    get: () => literal.replace(/\{([si]):(\w+)\}/g, (all, kind, key) => {
      let owner = label.parent;
      while (owner && !(owner.__dialog && key in owner.__dialog)) owner = owner.parent;
      if (!owner) return all;
      return kind === "i" ? Number(owner.__dialog[key]).toLocaleString("en-US") : String(owner.__dialog[key]);
    }),
    set: (next) => { literal = String(next); } });
  return label;
}
// graph (optional): the stock graph's 40 columns and its tooltip in team mode, as live (client 6819):
// hovering a column through DispatchPanelEvent shows PostGameGraphTooltip under the dashboard root with
// "m:ss | <team> | <souls> | (<pct>%) | <team> | ... | <total>", Archmother (team 2) first. Live
// (demo 121685912) the last column read 171,451 against a totals row of 171,452.
function boardWorld({ visible = true, graph = null, names = true, disk = null, offline = false, api = {} } = {}) {
  const harness = createPanoramaHarness({ now: 7000000, rootWidth: 1600, rootHeight: 900 });
  lastLogs = harness.logs;
  const bus = [];
  let nextId = 1;
  const dollar = (panel) => ({
    GetContextPanel: () => panel,
    CreatePanel: (type, parent, id, props = {}) => {
      const created = new MockPanel(type, parent, id);
      for (const [key, value] of Object.entries(props)) {
        if (key === "class") created.classes = String(value).split(/\s+/).filter(Boolean);
        else if (key === "text") bindAll(created, value);
        else created.attributes[key] = String(value);
      }
      // The engine's CitadelUserName makes one Label with the account's name (live).
      if (names && type === "CitadelUserName" && props.accountid) new MockPanel("Label", created, "").__text = `Persona ${props.accountid}`;
      return created;
    },
    Schedule: (delay, fn) => harness.scheduler.schedule(delay, () => { frameCheck(); fn(); }),
    RegisterForUnhandledEvent: (name, fn) => { bus.push({ id: nextId, name, fn }); return nextId++; },
    UnregisterForUnhandledEvent: (name, id) => {
      const index = bus.findIndex((entry) => entry.id === id);
      if (index >= 0) bus.splice(index, 1);
    },
    // Panel event handlers add up (a reloaded script's old handler stays registered).
    RegisterEventHandler: (name, target, fn) => {
      target.__handlers = target.__handlers || {};
      (target.__handlers[name] = target.__handlers[name] || []).push(fn);
    },
    DispatchEvent: (name, ...args) => {
      if (name === "DispatchPanelEvent" && args[0] && args[0].paneltype === "CitadelModIcon") { itemTip.hover(args[0], args[1]); return true; }
      if (graph && name === "DispatchPanelEvent" && args[1] === "onmouseover") showTip(args[0]);
      // The native column mouseout hides the tooltip: TooltipVisible off (client.dll 6821 0x181a98620).
      if (graph && name === "DispatchPanelEvent" && args[1] === "onmouseout" && tip && graphCanvas && graphCanvas.children.includes(args[0])) tip.classes.delete("TooltipVisible");
      if (name === "ExternalBrowserGoToURL") copy.urls.push(args[0]);
      if (name === "CitadelPostGameCopyMatchID") { if (copy.stockThrows) throw new Error("Event arguments could not be parsed"); copy.stock.push(args[0]); }
      if (name === "TextEntryCopyToClipboard") copy.entry.push({ text: String(args[0].text), selected: !!args[0].allSelected, focused: !!args[0].focused });
      if (graph && graph.lanes && name === "CitadelMatchDetailsGraphClickPlayer") showLane(args[0], args[1]);
      if (graph && graph.timeline && name === "CitadelGraphShowAsTeam") gstate.change({ team: !!args[1] });
      if (graph && graph.timeline && name === "CitadelMatchDetailsGraphClickPlayer") gstate.change({ pick: Number(args[1]) });
      return true;
    },
    Localize: (token) => ({ "#Citadel_Team1_Name": "Hidden King", "#Citadel_Team2_Name": "Archmother", ...ITEM_LOC })[token] || token,
    Msg: (message) => harness.logs.push(String(message))
  });
  const runIn = (panel, files) => {
    const context = createVmContext(harness, { globals: { $: dollar(panel) } });
    for (const [name, source] of files) runInVm(source, context, name);
    return context;
  };
  MockPanel.prototype.BLoadLayout = function (file) {
    if (file === "file://{resources}/layout/detailed_postgame/pg_board.xml") {
      loadInto(this, PG.board);
      Object.assign(this, { actuallayoutwidth: 1920, actualuiscale_x: 1 }); // a 16:9 page, as the engine reports it (the fit check sets others)
      runIn(this, [["pg_board.js", script("pg_board.js")]]);
      return true;
    }
    if (file === "file://{resources}/layout/detailed_postgame/pg_column.xml") {
      loadInto(this, PG.column);
      return true;
    }
    return false;
  };
  const dash = new MockPanel("CitadelDashboardRoot", { operationCounts: harness.operationCounts, findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts, eventSetCounter: harness.eventSetCounter });
  dash.__web = { disk: disk || {}, offline, harness, api };
  const itemTip = itemTooltip(dash, harness);
  WORLDS.push(dash);
  const page = instantiate(PG.page, dash);
  if (visible) page.AddClass("PageVisible");
  const scoreboard = page.FindChildTraverse("Scoreboard");
  // Graph model: columns under MatchDetailsGraphs#Graphs, one tooltip panel created on the first hover.
  // Stock tooltip_base (6821): .TooltipContainer { opacity: 0 } and .TooltipVisible { opacity: 1 }; the
  // native show adds TooltipVisible, the native hide removes it. An inline opacity beats both rules.
  const tipLog = { opaqueFrames: 0, shows: 0 };
  const copy = { stock: [], entry: [], stockThrows: false, urls: [] };
  let tip = null;
  // Timeline mock (graph.timeline): what the stock graph shows (type, team mode, picked button), and the
  // tooltip each graph gives at column c, shaped like citadel_tooltip_graph_playernetworth.xml (6864 probe).
  // graph.timeline(player, f, key) -> the player's value at fraction f (default: the final value * f, healing
  // without barrier ending at 90 %). Buttons are PlayerButton<k+1> = the k-th player, team 1 first.
  const gstate = {
    shown: { type: 0, team: true, pick: 1 }, want: null, wait: 0, typeOf: {},
    change(part) {
      const want = Object.assign({}, this.want || this.shown, part);
      if (JSON.stringify(want) === JSON.stringify(this.want || this.shown)) return; // the same pick again changes nothing
      this.want = want;
      this.wait = graph.lag || 0;
      if (!this.wait) { this.shown = this.want; this.want = null; }
    },
    frame() {
      if (this.want && --this.wait <= 0) { this.shown = this.want; this.want = null; }
    }
  };
  const statKey = { souls: "net_worth", kills: "player_kills", deaths: "player_deaths", pdmg: "player_dmg", odmg: "obj_dmg", heal: "player_healing" };
  const valueAt = (p, f, key) => {
    if (graph.timeline !== true) return graph.timeline(p, f, key);
    const end = key === "heal" ? Math.round(p[statKey.heal] * 0.9) : p[statKey[key]];
    return Math.round(end * f);
  };
  // Live 6864 (match 121685912): buttons 4 and 7, 8 and 11 had the same colour; so do players 3 and 6, 7 and 10 here.
  const playerColor = (k) => `#${(0x30 + 16 * ({ 6: 3, 10: 7 }[k] ?? k)).toString(16)}4B85FF`.toUpperCase();
  // Damage from Players: 5,000 plus 2,000 a death at the end, growing evenly.
  const mockTaken = (p, f) => Math.round((5000 + 2000 * p.player_deaths) * f);
  // Souls by Source: kill souls follow the kills (300 a kill), the sources add up to all but ~3 % of the souls
  // (live 121685912: 21,408 of 22,095), the rest from haunts.
  const mockSources = (p, f) => {
    const souls = valueAt(p, f, "souls");
    const kills = Math.min(300 * valueAt(p, f, "kills"), Math.round(souls * 0.3));
    return [["Troopers", Math.round(souls * 0.6)], ["Enemy Kills", kills], ["Haunts", Math.round(souls * 0.97) - Math.round(souls * 0.6) - kills]];
  };
  const timelineTip = (c, count) => {
    const f = (c + 1) / count;
    const t = Math.round(f * graph.duration);
    const players = shownMatch ? shownMatch.teams.flat() : [];
    const row = (cls) => { const r = new MockPanel("Panel", tip, ""); r.classes.add("Row"); for (const k of cls) r.classes.add(k); return r; };
    const label = (parent, cls, text) => { const l = new MockPanel("Label", parent, ""); if (cls) l.classes.add(cls); l.__text = text; return l; };
    label(row(["MatchTime"]), "", `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    const general = { "Souls Collected": "souls", Kills: "kills", Deaths: "deaths", Healing: "heal" }[gstate.typeOf[gstate.shown.type]];
    let named = [];
    if (general) {
      const vals = players.map((p, k) => ({ k, hero: p.hero, v: valueAt(p, f, general) })).filter((x) => x.v > 0).sort((x, y) => y.v - x.v);
      const sum = vals.reduce((s, x) => s + x.v, 0);
      for (const x of vals) {
        const r = row([]);
        // Live (6864 probe2): the row's hero image has no heroid; its colour bar carries the player's colour.
        new MockPanel("Panel", r, "ColorBar").style.backgroundColor = playerColor(x.k);
        new MockPanel("CitadelHeroImage", r, "HeroImage").heroid = graph.rowHeroIds ? x.hero : 0;
        label(r, "ValueLabel", x.v.toLocaleString("en-US"));
        label(r, "PctLabel", `${Math.round(100 * x.v / sum)}%`);
      }
      label(row(["LabelRow", "TotalRow"]), "ValueLabel", sum.toLocaleString("en-US"));
      return;
    }
    const type = gstate.typeOf[gstate.shown.type];
    // graph.drift: once, a hover on column `col` or later (not the last) with button `pick` picked switches the pick to `to`
    // (live 2026-11-23: the last columns of hero 12's damage read hero 86's).
    const d = graph.drift;
    if (d && !d.done && type === d.type && gstate.shown.pick === d.pick && c >= d.col && c < count - 1) { d.done = true; gstate.shown = Object.assign({}, gstate.shown, { pick: d.to }); }
    const p = players[gstate.shown.pick - 1];
    if (!p) return;
    if (type === "Souls by Source") {
      named = mockSources(p, f);
    } else if (type === "Damage Dealt by Type") {
      // gun, headshots, melee and one ability: adds up to the player damage, as live
      const dmg = valueAt(p, f, "pdmg");
      const gun = Math.round(dmg * 0.4), crit = Math.round(dmg * 0.1), melee = Math.round(dmg * 0.1);
      named = [["Gun Damage", gun], ["Gun Damage - Crit", crit], ["Melee", melee], ["Singularity", dmg - gun - crit - melee]];
    } else if (type === "Damage from Players") {
      // one nameless row per enemy hero (live: hero images only), then the total
      const taken = mockTaken(p, f);
      const parts = [Math.round(taken * 0.5), Math.round(taken * 0.3)];
      parts.push(taken - parts[0] - parts[1]);
      for (const x of parts.filter((x) => x > 0)) {
        const r = row([]);
        new MockPanel("CitadelHeroImage", r, "HeroImage").heroid = 0;
        label(r, "ValueLabel", x.toLocaleString("en-US"));
        label(r, "PctLabel", `${Math.round(100 * x / taken)}%`);
      }
      label(row(["LabelRow", "TotalRow"]), "ValueLabel", taken.toLocaleString("en-US"));
      return;
    } else if (type === "Healing by Type") {
      const heal = valueAt(p, f, "heal");
      named = [["Melee Lifesteal", Math.round(heal * 0.6)], ["Restorative Shot", heal - Math.round(heal * 0.6)]];
    } else if (type === "Damage Breakdown") {
      named = [["Troopers", Math.round(valueAt(p, f, "pdmg") * 1.5)], ["Enemy Players", valueAt(p, f, "pdmg")], ["Objectives", valueAt(p, f, "odmg")]];
    }
    named = named.filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]);
    const sum = named.reduce((s, [, x]) => s + x, 0);
    for (const [name, x] of named) {
      const r = row(["LabelRow"]);
      new MockPanel("Panel", r, "ColorBar");
      label(r, "ValueName", name);
      label(r, "ValueLabel", x.toLocaleString("en-US"));
      label(r, "PctLabel", `(${Math.round(100 * x / sum)}%)`);
    }
    label(row(["LabelRow", "TotalRow"]), "ValueLabel", sum.toLocaleString("en-US"));
  };
  const showTip = (col) => {
    const cols = graphCanvas ? graphCanvas.children : [];
    const c = cols.indexOf(col);
    if (c < 0) return;
    if (!tip) { tip = new MockPanel("CitadelTooltipGraphPlayerNetWorth", dash, "PostGameGraphTooltip"); tip.classes.add("TooltipContainer"); }
    tip.visible = true;
    tip.classes.add("TooltipVisible");
    tipLog.shows++;
    for (const kid of tip.children.slice()) kid.DeleteAsync();
    if (graph.timeline && !(gstate.shown.type === 0 && gstate.shown.team)) { timelineTip(c, cols.length); return; }
    const f = (c + 1) / cols.length;
    const t = Math.round(f * graph.duration);
    // graph.values(f) -> [team 1, team 2] souls at fraction f (default: straight lines to the totals).
    const [a, b] = graph.values ? graph.values(f) : [Math.round(graph.souls[0] * f), Math.round(graph.souls[1] * f)];
    const label = (text) => { new MockPanel("Label", tip, "").__text = text; };
    label(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    // graph.tipNames = [team 2 row, team 1 row] (default the stock team names).
    const [n2, n1] = graph.tipNames || ["Archmother", "Hidden King"];
    for (const [name, v] of [[n2, b], [n1, a]]) {
      label(name);
      label(v.toLocaleString("en-US"));
      label(`(${Math.round(100 * v / (a + b))}%)`);
    }
    label((a + b).toLocaleString("en-US"));
  };
  // Lane Stats (graph type 12): picking a player shows that player's lane (three lanes, by button);
  // graph.lanes[lane] = [[team 1 tier 1 falls, team 2 tier 1 falls], [tier 2], [barracks]] in seconds, -1 = stands.
  // The stock page is viewer-relative (seen 2026-11-13, client 6861): graph.left = the team number on the left
  // (default 1; 2 = team 2 left, the labels mirror with it). graph.sides = what tells the script which side
  // that is: "lane" (default; hero images in #LeftPlayers / #RightPlayers), "button" (only the PlayerButton<n>
  // heroids under #TeamCtnLeft / #TeamCtnRight) or "none" (no hero ids anywhere).
  let shownMatch = null;
  const showSides = (graphs, n, li) => {
    const left = graph.left || 1;
    const sides = graph.sides || "lane";
    for (const id of ["LeftPlayers", "RightPlayers"]) {
      const old = graphs.FindChildTraverse(id);
      if (old) old.DeleteAsync();
    }
    const lp = new MockPanel("Panel", graphs, "LeftPlayers");
    const rp = new MockPanel("Panel", graphs, "RightPlayers");
    if (!shownMatch || sides !== "lane") return;
    [[lp, left - 1], [rp, 2 - left]].forEach(([ctn, t]) => {
      for (const k of [li % 3, li % 3 + 3]) {
        const snippet = new MockPanel("Panel", ctn, "");
        const image = new MockPanel("CitadelHeroImage", snippet, "HeroImage");
        image.heroid = shownMatch.teams[t][k].hero;
      }
    });
  };
  // "button": the stock graph buttons sit under #TeamCtnLeft / #TeamCtnRight with their hero ids, from the fill on.
  const showButtons = (graphs, m) => {
    if ((graph.sides || "lane") !== "button") return;
    for (const id of ["TeamCtnLeft", "TeamCtnRight"]) {
      const old = graphs.FindChildTraverse(id);
      if (old) old.DeleteAsync();
    }
    const cl = new MockPanel("Panel", graphs, "TeamCtnLeft");
    const cr = new MockPanel("Panel", graphs, "TeamCtnRight");
    m.teams.flat().forEach((p, k) => {
      const team = Math.floor(k / m.teams[0].length) + 1;
      const wrap = new MockPanel("Panel", team === (graph.left || 1) ? cl : cr, "");
      const button = new MockPanel("Button", wrap, `PlayerButton${k + 1}`);
      new MockPanel("CitadelHeroImage", button, "HeroImage").heroid = p.hero;
      // The player's colour swatch (live 6864: #PlayerColor with an inline background-color, as the tooltip's #ColorBar).
      new MockPanel("Panel", button, "PlayerColor").style.backgroundColor = playerColor(k);
    });
  };
  const showLane = (graphs, n) => {
    const li = (Number(n) - 1) % graph.lanes.length;
    const lane = graph.lanes[li];
    const mmss = (t) => (t < 0 ? "-" : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    for (const id of ["LaneStatTier1", "LaneStatTier2", "LaneStatBarracks", "LaneStatKills", "LaneStatNetWorth"]) {
      const old = graphs.FindChildTraverse(id);
      if (old) old.DeleteAsync();
    }
    showSides(graphs, n, li);
    const [lt, rt] = graph.left === 2 ? [1, 0] : [0, 1];
    ["LaneStatTier1", "LaneStatTier2", "LaneStatBarracks"].forEach((id, i) => {
      const panel = new MockPanel("Panel", graphs, id);
      for (const text of [mmss(lane[i][lt]), id, mmss(lane[i][rt])]) { const l = new MockPanel("Label", panel, ""); l.text = text; }
    });
    for (const id of ["LaneStatKills", "LaneStatNetWorth"]) { const l = new MockPanel("Label", new MockPanel("Panel", graphs, id), ""); l.text = `${id} ${n}`; }
  };
  // A frame boundary while the scan runs: the tooltip must not be drawn (user report 2026-10-25).
  let scanning = false;
  const frameCheck = () => {
    gstate.frame();
    const has = (prefix) => harness.logs.some((l) => l.startsWith(prefix));
    // The scan, then the stat timeline, hover the graph; neither may draw the tooltip.
    scanning = has("[DPS] board shown") && (!has("[DPS] scan done") || (has("[DPS] timeline: ") && !has("[DPS] timeline done")));
    if (scanning && tipDrawn()) tipLog.opaqueFrames++;
  };
  // What the player sees: the inline opacity if one was written, else the stock classes.
  const tipDrawn = () => !!tip && tip.visible && (tip.style.opacity !== undefined && tip.style.opacity !== null && String(tip.style.opacity) !== ""
    ? String(tip.style.opacity) !== "0" : tip.classes.has("TooltipVisible"));
  let graphCanvas = null;
  if (graph) {
    graphCanvas = new MockPanel("Panel", page.FindChildTraverse("Graphs"), "Graph");
    for (let i = 0; i < 40; i++) new MockPanel("Panel", graphCanvas, "");
  }
  if (graph && graph.timeline) {
    // The type dropdown (live 6864 order and ids unless graph.typeIds renames them: label -> id) and its
    // section headers (no id). SetSelected switches the shown graph graph.lag frames later (0: at once).
    const graphs = page.FindChildTraverse("Graphs");
    const dd = new MockPanel("DropDown", graphs, "TypeDropDown");
    const ids = Object.assign({ "Souls Collected": 0, "Souls per Minute": 3, Kills: 1, Deaths: 2, Healing: 6, "Lane Stats": 12,
      "Souls by Source": 4, "Damage Breakdown": 5, "Damage Dealt by Type": 7, "Healing by Type": 8, "Damage to Players": 10,
      "Damage from Players": 11 }, graph.typeIds || {});
    for (const [label, id] of [["General", null]].concat(Object.entries(ids))) new MockPanel("Label", dd, id === null ? "" : `type_${id}`).__text = label;
    dd.SetSelected = function (id) { this.selected = this.FindChildTraverse(id); gstate.change({ type: Number(String(id).replace("type_", "")) }); };
    gstate.typeOf = Object.fromEntries(Object.entries(ids).map(([label, id]) => [id, label]));
  }
  // The stock rows, cloned once by C++ and reused for the next match.
  const fill = (m) => {
    shownMatch = m;
    if (graph) showButtons(page.FindChildTraverse("Graphs"), m);
    page.__dialog = { match_id: m.id, match_minutes: m.minutes, match_seconds: String(m.seconds).padStart(2, "0") };
    if (!scoreboard.children.length) {
      // Stock CSS (6819): .ScoreboardScrollContainer { overflow: scroll squish; transform: translateY(80px); }
      const inner = new MockPanel("Panel", scoreboard, "");
      inner.classes.add("ScoreboardScrollContainer");
      new MockPanel("Panel", inner, "MatchInfoContainer");
      for (const t of [1, 2]) {
        const team = new MockPanel("Panel", inner, `Team${t}`);
        new MockPanel("Panel", team, "TeamTableHeader");
        const players = new MockPanel("Panel", team, "TeamPlayers");
        for (let k = 0; k < 7; k++) {
          const row = new MockPanel("Panel", players, "");
          // Stock: the first row child is .CommendContainer with #CommendPlayerButton.
          const commend = new MockPanel("Panel", row, "");
          commend.classes.add("CommendContainer");
          new MockPanel("Button", commend, "CommendPlayerButton");
          new MockPanel("Panel", commend, "LocalPlayerIdentifier"); // stock caret on your own card
          new MockPanel("Panel", row, "StatCells");
          const main = new MockPanel("Panel", row, "PlayerInfo");
          if (k === 6) { row.classes.add("TotalsRow"); continue; }
          new MockPanel("Label", new MockPanel("CitadelUserName", main, "PlayerName"), "");
          const items = new MockPanel("Panel", main, "ItemsContainer");
          new MockPanel("Button", main, "CopyBuildButton"); // stock "Create Build", the row's last child
          for (let i = 0; i < 9; i++) new MockPanel("CitadelModIcon", items, "");
        }
      }
    }
    for (const t of [1, 2]) {
      const team = scoreboard.FindChildTraverse(`Team${t}`);
      if (m.win === t) team.classes.add("IsWinningTeam");
      else team.classes.delete("IsWinningTeam");
      const rows = team.FindChildTraverse("TeamPlayers").children;
      const players = m.teams[t - 1];
      players.forEach((p, k) => {
        rows[k].__dialog = Object.assign({ hero_id: p.hero }, Object.fromEntries(PG_STATS.map((key) => [key, p[key]])));
        const name = rows[k].FindChildTraverse("PlayerName");
        name.accountid = p.account;
        // p.items: the final items' names, in the stock icon order (the item tooltip mock shows them).
        rows[k].FindChildTraverse("ItemsContainer").children.forEach((icon, i) => {
          icon.__itemName = (p.items || [])[i] || "";
          if (icon.__itemName) icon.classes.add("isWeapon"); else icon.classes.delete("isWeapon"); // stock: an empty slot has no category
          if (!icon.FindChild("modIconContainer")) new MockPanel("Panel", icon, "modIconContainer"); // stock: its children overlap
        });
        name.children[0].__text = `Persona ${p.account}`;
      });
      rows[6].__dialog = Object.assign({ hero_id: 0 }, Object.fromEntries(PG_STATS.map((key) => [key, players.reduce((s, p) => s + p[key], 0)])));
    }
  };
  const fire = (name, ...args) => { for (const entry of bus.slice()) if (entry.name === name) entry.fn(...args); };
  const pageEvent = (name, ...args) => { for (const fn of ((page.__handlers || {})[name] || []).slice()) fn(...args); };
  // The carousel focuses the picked screen, then the page gets the screen index (live: 3 = Scoreboard).
  const selectScreen = (id) => {
    for (const screen of PG_SCREENS) page.FindChildTraverse(screen).classes[screen === id ? "add" : "delete"]("Focused");
    pageEvent("CitadelPostGameSelectScreenIndex", PG_SCREENS.indexOf(id) + 1);
  };
  const boardHost = () => page.FindChildTraverse("ScoreboardScreen").FindChild("NSHost");
  const shown = () => harness.logs.filter((line) => line.startsWith("[DPS] board shown")).length;
  const columns = () => findAll(scoreboard, "Panel").filter((p) => p.valid && (p.classes.has("NSColumnTeam1") || p.classes.has("NSColumnTeam2")));
  return { harness, page, scoreboard, bus, fill, fire, selectScreen, boardHost, shown, columns, tipLog, itemTip, web: dash.__web,
    tip: () => tip, tipDrawn, copy,
    // The player's own mouse on graph column c, and leaving it: the stock column events.
    userHover: (c) => showTip(graphCanvas.children[c]),
    userLeave: () => { if (tip) tip.classes.delete("TooltipVisible"); },
    boot: () => runIn(page, [["pg_loader.js", script("pg_loader.js")]]),
    reload: () => runIn(boardHost(), [["pg_board.js", script("pg_board.js")]]),
    dash,
    advance: (ms) => harness.scheduler.runFor(ms, 1e6),
    text: (id) => boardHost().FindChildTraverse(id).__text };
}

check("board: the scan reads the lead with a totals row a few souls off, and the tooltip is never drawn while it runs", () => {
  const m = pgMatch(121685912);
  const totals = m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  // Live (demo 121685912): the graph's last column was 1 soul under the Sapphire totals row.
  const w = boardWorld({ graph: { duration: m.minutes * 60 + m.seconds, souls: [totals[0], totals[1] - 1] } });
  w.boot();
  w.fill(m);
  w.fire("CitadelMatchDetailsUpdated", m.id);
  w.advance(30000);
  assert.ok(w.harness.logs.some((l) => l.startsWith("[DPS] scan done")), "scan finished");
  const series = w.harness.logs.filter((l) => l.startsWith("[DPS] data series + "));
  assert.ok(series.length >= 30, `lead points: ${series.length}`);
  assert.ok(w.boardHost().FindChildTraverse("NSGraph").BHasClass("NSOn"), "lead graph shown");
  assert.ok(w.tipLog.shows > 0, "the scan hovered the graph");
  assert.equal(w.tipLog.opaqueFrames, 0, "tooltip drawn during the scan");
  // How it failed (user report 2026-10-29): the board wrote the tooltip's inline opacity ("1" on the Graphs
  // screen), which beats the stock .TooltipContainer opacity 0, so the contents stayed drawn after the mouse
  // left the graph; and the scan's synthetic hover was never closed. The board must never write it.
  const opacityWrites = () => (w.tip().__styleWrites || []).filter((x) => x.property === "opacity");
  deq(opacityWrites(), [], "no inline opacity on the stock tooltip");
  assert.ok(!w.tipDrawn(), "nothing drawn after the scan");
  // The Graphs screen without a hover shows nothing; a hover shows it, leaving the graph hides it.
  w.selectScreen("GraphsScreen");
  w.advance(1500);
  assert.ok(!w.tipDrawn(), "Graphs screen, no hover: no tooltip");
  w.userHover(12);
  w.advance(1500);
  assert.ok(w.tipDrawn(), "hovering a column shows it (the board leaves the stock alone)");
  w.userLeave();
  w.advance(1500);
  assert.ok(!w.tipDrawn(), "leaving the graph hides it");
  // A hover left open when the carousel moves (user report 2026-10-26) is hidden off the Graphs screen.
  w.userHover(30);
  w.selectScreen("ScoreboardScreen");
  w.advance(1500);
  assert.ok(!w.tipDrawn(), "hidden over the scoreboard");
  w.selectScreen("GraphsScreen");
  w.advance(1500);
  assert.ok(!w.tipDrawn(), "and not back without a hover");
  w.userHover(5);
  w.advance(1500);
  assert.ok(w.tipDrawn(), "a new hover still shows it");
  deq(opacityWrites(), [], "still no inline opacity");
});

check("board: the Play Again flame is put back even when the board cannot load", () => {
  const w = boardWorld();
  const fx = w.page.FindChildTraverse("PlayButtonFX");
  assert.ok(fx, "the page has #PlayButtonFX");
  const movies = [];
  fx.SetMovie = (src) => movies.push(src);
  fx.Play = () => movies.push("play");
  const load = MockPanel.prototype.BLoadLayout;
  MockPanel.prototype.BLoadLayout = () => false; // the board layout fails to load
  try {
    w.boot();
    w.advance(1000);
  } finally {
    MockPanel.prototype.BLoadLayout = load;
  }
  deq(movies, ["file://{resources}/videos/pick_screen/play_btn_grn_flame.webm", "play"], "the flame plays");
});

check("board: builds when the match loads, again for the next match on the reused rows, never twice for one", () => {
  const w = boardWorld();
  w.boot();
  w.advance(2000);
  // No rows yet: the indeterminate LOADING MATCH bar.
  assert.ok(w.boardHost().BHasClass("NSBusy") && w.boardHost().FindChildTraverse("NSProgress").BHasClass("NSIndeterminate"), "loading bar");
  assert.equal(w.shown(), 0);
  const a = pgMatch(121917141);
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(300);
  assert.equal(w.shown(), 1, "built within 0.3 s of the match event");
  assert.equal(w.text("NSMatch"), `MATCH ${a.id}`);
  assert.equal(w.columns().length, 12);
  // Exact values through the bound label (stock rows show "21k").
  const first = w.columns()[0].FindChildrenWithClassTraverse("NSCellValue")[0];
  assert.equal(first.__text, a.teams[0][0].net_worth.toLocaleString("en-US"));
  // Live 2026-10-25 (user): items in the 3rd and 4th icon rows could not be hovered. The stock scroll
  // container is drawn translateY(80px) below its box, and the scoreboard's box (fit to the untranslated
  // rows) ends 80 px above the drawn rows, so hover never reaches their bottom 80 px. The rows must be laid
  // out where they are drawn, at the same height as before (stock margin 49 + 80 + 1 measured = 130).
  const shift = String(w.scoreboard.children[0].style.transform || "") === "none" ? 0 : 80;
  assert.equal(shift, 0, "the stock scroll container is not translated");
  assert.equal(parseInt(w.scoreboard.style.marginTop, 10) + shift, 129, "the rows stay at the same height");
  w.advance(5000);
  assert.equal(w.shown(), 1, "one build per match");
  // The next match on the same rows (C++ reuses them).
  const b = pgMatch(121880956, { swap: true, win: 2 });
  w.fill(b);
  w.fire("CitadelMatchDetailsUpdated", b.id);
  w.advance(300);
  assert.equal(w.shown(), 2);
  assert.equal(w.text("NSMatch"), `MATCH ${b.id}`);
  assert.equal(w.columns().length, 12, "the old match's columns are gone");
  // A load that brings no event is still found by the safety check within its second.
  const c = pgMatch(121999999);
  w.fill(c);
  w.advance(1100);
  assert.equal(w.shown(), 3, "found without an event");
  assert.equal(w.text("NSMatch"), `MATCH ${c.id}`);
});

check("board: the next game in the same lobby waits for its own graph; the last game's graph is never drawn", () => {
  const a = pgMatch(121917141);
  const b = pgMatch(121880956, { swap: true, win: 2 });
  // Another game: other souls (thousands apart, as real games are) and another length.
  b.teams[0].forEach((p, k) => { p.net_worth += 2500 + 300 * k; });
  b.minutes = 26;
  const sum = (m) => m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  const graph = { duration: a.minutes * 60 + a.seconds, souls: sum(a), lanes: [[[300, -1], [-1, -1], [-1, -1]]] };
  const w = boardWorld({ graph });
  const done = () => w.harness.logs.filter((l) => l.startsWith("[DPS] scan done"));
  const eventTimes = (from) => w.harness.logs.slice(from).filter((l) => l.startsWith("[DPS] data events + "))
    .map((l) => JSON.parse(l.slice("[DPS] data events + ".length)).t);
  w.boot();
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(30000);
  assert.equal(done().length, 1);
  assert.match(done()[0], /: [1-9]\d* lead points, .* [1-9]\d* objectives$/, "game 1 read");
  // Game 2: its rows, but the Graphs data is still game 1's for a few seconds.
  const from = w.harness.logs.length;
  w.fill(b);
  w.fire("CitadelMatchDetailsUpdated", b.id);
  w.advance(4000);
  assert.equal(w.text("NSMatch"), `MATCH ${b.id}`, "the rows are game 2's");
  assert.equal(done().length, 1, "no scan settled on game 1's graph");
  assert.ok(w.harness.logs.some((l) => l.includes("the graph is not this match's yet")), "it waits");
  graph.duration = b.minutes * 60 + b.seconds;
  graph.souls = sum(b);
  graph.lanes = [[[400, 900], [-1, -1], [-1, -1]]];
  w.advance(30000);
  assert.equal(done().length, 2, "read once game 2's graph is there");
  assert.match(done()[1], /: [1-9]\d* lead points, .* [1-9]\d* objectives$/, "game 2's lead and objectives");
  const times = eventTimes(from);
  assert.ok(times.includes(400) && times.includes(900) && !times.includes(300), `game 2's objectives only (${times})`);
  assert.ok(w.boardHost().FindChildTraverse("NSGraph").BHasClass("NSOn"), "lead graph shown");
});

check("board: a graph that never becomes this match's gives no lead, no objectives and no souls by source", () => {
  const a = pgMatch(121917141);
  const b = pgMatch(121880956, { swap: true, win: 2 });
  b.teams[0].forEach((p, k) => { p.net_worth += 2500 + 300 * k; });
  // The same length as game 1: the stale graph's last column sits at game 2's end time.
  b.minutes = a.minutes;
  b.seconds = a.seconds;
  const sum = (m) => m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  const w = boardWorld({ graph: { duration: a.minutes * 60 + a.seconds, souls: sum(a), lanes: [[[300, -1], [-1, -1], [-1, -1]]] } });
  const done = () => w.harness.logs.filter((l) => l.startsWith("[DPS] scan done"));
  w.boot();
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(30000);
  assert.equal(done().length, 1);
  w.fill(b);
  w.fire("CitadelMatchDetailsUpdated", b.id);
  w.advance(120000);
  assert.equal(done().length, 2, "the retries ran out and the scan settled");
  assert.match(done()[1], /: 0 lead points, 0 souls, 0 lanes, 0 objectives$/, `nothing of game 1 is shown for game 2: ${done()[1]}`);
  assert.ok(w.boardHost().FindChildTraverse("NSLabels").BHasClass("NSNoSouls"), "no souls by source at all drops the row");
  // While a scan runs the row stays (souls arrive at its end): the build puts it back.
  const before = done().length;
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  assert.equal(done().length, before, "the next scan is still running");
  assert.ok(!w.boardHost().FindChildTraverse("NSLabels").BHasClass("NSNoSouls"), "the row is back while the next scan runs");
});

check("board: a scan cut short by the next match does not block the graph retry (fix 1)", () => {
  const a = pgMatch(121917141);
  const b = pgMatch(121880956, { swap: true, win: 2 });
  const sum = (m) => m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  let stall = true; // the tooltip shows the wrong totals: game 1's first scan step waits for a frame
  const graph = { duration: a.minutes * 60 + a.seconds, souls: sum(a), lanes: [[[300, -1], [-1, -1], [-1, -1]]],
    values: (f) => (stall ? [1, 1] : [Math.round(graph.souls[0] * f), Math.round(graph.souls[1] * f)]) };
  const w = boardWorld({ graph });
  const done = () => w.harness.logs.filter((l) => l.startsWith("[DPS] scan done"));
  w.boot();
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  assert.equal(done().length, 0, "game 1's scan is still running");
  // Game 2 opens while the Graphs page has no columns yet: its scan finds none and waits to retry.
  const canvas = w.page.FindChildTraverse("Graph");
  const kids = canvas.children.slice();
  canvas.children.length = 0;
  w.fill(b);
  w.fire("CitadelMatchDetailsUpdated", b.id);
  w.advance(500);
  canvas.children.push(...kids);
  stall = false;
  graph.duration = b.minutes * 60 + b.seconds;
  graph.souls = sum(b);
  w.advance(30000);
  assert.equal(done().length, 1, "the retry ran once the columns came: game 2's scan settled");
});

check("board: the scan only steps through the graph buttons that exist, and a tied end shows no lead pill (fixes 3, 9)", () => {
  const steps = (m) => {
    const souls = m.teams.map((t) => t.reduce((s, p) => s + p.net_worth, 0));
    const w = boardWorld({ graph: { duration: m.minutes * 60 + m.seconds, souls, lanes: [[[300, -1], [-1, -1], [-1, -1]]] } });
    w.boot();
    w.fill(m);
    // A smaller game: the stock page has only as many player rows as players.
    for (const t of [1, 2]) w.scoreboard.FindChildTraverse(`Team${t}`).FindChildTraverse("TeamPlayers").children.splice(m.teams[t - 1].length, 6 - m.teams[t - 1].length);
    w.fire("CitadelMatchDetailsUpdated", m.id);
    w.advance(60000);
    const line = w.harness.logs.find((l) => /scan: \d+ steps/.test(l));
    assert.ok(line, "the scan ran");
    return { n: Number(/scan: (\d+) steps/.exec(line)[1]), w };
  };
  const full = pgMatch(121917141);
  const small = pgMatch(121917141);
  small.teams = small.teams.map((t) => t.slice(0, 3));
  const nFull = steps(full).n;
  const nSmall = steps(small).n;
  assert.ok(nFull - nSmall >= 12, `6 players take fewer steps than 12 (${nSmall} against ${nFull})`);
  const pill = (w) => w.boardHost().FindChildTraverse("NSGraphEnd");
  assert.equal(String(pill(steps(full).w).style.visibility), "visible", "a lead shows the pill");
  const tied = pgMatch(121917141);
  tied.teams[1].forEach((p, k) => { p.net_worth = tied.teams[0][k].net_worth; });
  tied.teams[1][5].net_worth += 30; // 30 souls apart at the end (the pairing needs a difference): it prints +0.0K
  const even = steps(tied);
  assert.equal(String(pill(even.w).style.visibility), "collapse", "a tied end hides the pill");
});

check("board: tied totals (Street Brawl 136872372: all 8 players end on 22,400) read in one scan, no retry loop; an unnamed lead is drawn only when flat", () => {
  const run = ({ swing, tipNames }) => {
    const m = pgMatch(136872372);
    m.minutes = 7;
    m.seconds = 26;
    m.teams = m.teams.map((t) => t.slice(0, 4));
    m.teams.forEach((t) => t.forEach((p) => { p.net_worth = 22400; }));
    const end = 4 * 22400;
    // swing: team 1 leads by up to 3,000 mid-game; the end is tied either way.
    const values = (f) => {
      const lead = swing ? Math.round(3000 * Math.sin(Math.PI * f)) : 0;
      return [Math.round(end * f) + lead, Math.round(end * f)];
    };
    const w = boardWorld({ graph: { duration: 446, souls: [end, end], values, tipNames, lanes: [[[-1, -1], [-1, -1], [-1, -1]]] } });
    w.boot();
    w.fill(m);
    for (const t of [1, 2]) w.scoreboard.FindChildTraverse(`Team${t}`).FindChildTraverse("TeamPlayers").children.splice(4, 2);
    w.fire("CitadelMatchDetailsUpdated", m.id);
    w.advance(60000);
    const logs = w.harness.logs;
    const done = logs.filter((l) => l.startsWith("[DPS] scan done"));
    assert.equal(logs.filter((l) => /scan: \d+ steps/.test(l)).length, 1, `one scan, no retries: ${logs.filter((l) => l.includes("again on the next check")).join(" / ")}`);
    assert.equal(done.length, 1, "the scan settled");
    const series = logs.filter((l) => l.startsWith("[DPS] data series + ")).map((l) => JSON.parse(l.slice("[DPS] data series + ".length)));
    const graphOn = w.boardHost().FindChildTraverse("NSGraph").BHasClass("NSOn");
    const align = [1, 2].map((t) => String(w.scoreboard.FindChildTraverse(`Team${t}`).FindChildTraverse("TeamPlayers").style.horizontalAlign));
    const columns = [];
    const walk = (p) => { if (p.classes && p.classes.has("NSColumn")) columns.push(p); for (const k of p.children || []) walk(k); };
    walk(w.scoreboard);
    const totalHidden = w.boardHost().FindChildTraverse("NSLabels").BHasClass("NSNoTotal") && columns.length === 8 && columns.every((c) => c.classes.has("NSNoTotal"));
    return { done: done[0], series, logs, graphOn, align, totalHidden };
  };
  const flat = run({ swing: false, tipNames: ["Team B", "Team A"] });
  assert.match(flat.done, /: 40 lead points/, flat.done);
  assert.ok(flat.series.every((p) => p.a === p.b), "a flat lead");
  assert.equal(flat.graphOn, true, "the graph stays with a lead of 0 everywhere (user 2026-11-14)");
  assert.ok(flat.totalHidden, "every player on 22,400: the total souls row and label are dropped");
  // Dropped by its slot, not its stat: row 1 may show SOULS / MIN (a saved row), which says as little (review 2026-11-23).
  assert.ok(/\.NSColumn\.NSNoTotal \.NSSlot0\s*[,{]/.test(read("panorama/styles/detailed_postgame/pg_board.css")) && !/NSNoTotal \.NSCell_souls/.test(read("panorama/styles/detailed_postgame/pg_board.css")), "the row-1 cell is hidden by slot");
  assert.deepEqual(flat.align, ["right", "left"], "4 columns a side hug the label column");
  const named = run({ swing: true });
  assert.match(named.done, /: 40 lead points/, named.done);
  assert.ok(named.series.some((p) => p.a - p.b > 1000) && named.series.every((p) => p.a >= p.b), "the stock team names name the rows: team 1 leads");
  assert.equal(named.graphOn, true, "a real lead is drawn");
  const unnamed = run({ swing: true, tipNames: ["Team B", "Team A"] });
  assert.match(unnamed.done, /: 0 lead points/, unnamed.done);
  assert.ok(unnamed.logs.some((l) => l.includes("the lead is not drawn")), "says why");
});

check("board: cheap while hidden, little while shown; a reopen without events, an early event and a screen pick are found", () => {
  const w = boardWorld({ visible: false });
  w.boot();
  // The match event can come before the page shows (live: event +0.5 s, page found +1.1 s).
  const a = pgMatch(121917141);
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(600);
  assert.equal(w.shown(), 0, "nothing built while hidden");
  w.page.AddClass("PageVisible");
  w.advance(300);
  assert.equal(w.shown(), 1, "built within 0.3 s of the page showing after an event");
  w.advance(10000);
  // Shown and built, nothing changing.
  reset(w);
  let stop = counted(w.harness);
  w.advance(10000);
  const shownOps = per(stop(), 10);
  console.log(`   board shown ${weighted(shownOps)} us/s, ${total(shownOps)} calls/s ${JSON.stringify(shownOps)}`);
  assert.equal((shownOps.textWrites || 0) + (shownOps.styleWrites || 0) + (shownOps.classWrites || 0), 0, "no writes while nothing changes");
  assert.ok(total(shownOps) <= BUDGET_BOARD.calls, `board shown: ${total(shownOps)} calls/s`);
  assert.ok(weighted(shownOps) <= BUDGET_BOARD.us, `board shown: ${weighted(shownOps)} us/s`);
  // The entrance never hides a board that is on screen (user 2026-10-26: "you can see the contents pop
  // first, then it hidden and reveal"). Built off screen, the board waits hidden (frame without NSIntro,
  // columns without NSIn, the stock items transparent); picking the Scoreboard screen plays the entrance at
  // once, at any phase of the safety check. Leaving it resets the entrance only once the carousel has moved
  // it away (1 s), and a quick return keeps it shown.
  const frame = w.boardHost().FindChildTraverse("NSFrame");
  const boardCols = w.columns();
  const items = boardCols.map((c) => c.GetParent().FindChild("ItemsContainer"));
  const hiddenNow = () => !frame.BHasClass("NSIntro") && boardCols.every((c) => !c.BHasClass("NSIn")) && items.every((p) => String(p.style.opacity) === "0");
  const shownNow = () => frame.BHasClass("NSIntro") && boardCols.every((c) => c.BHasClass("NSIn")) && items.every((p) => String(p.style.opacity) === "1");
  assert.equal(boardCols.length, 12, "12 columns");
  assert.ok(hiddenNow(), "built with no screen focused: the board waits hidden");
  let flashes = 0;
  let shownAt = -1;
  const scoreboardFocused = () => w.page.FindChildTraverse("ScoreboardScreen").BHasClass("Focused");
  for (const p of [frame, ...boardCols]) {
    const removeClass = p.RemoveClass;
    p.RemoveClass = function (cls) { if ((cls === "NSIntro" || cls === "NSIn") && this.BHasClass(cls) && scoreboardFocused()) flashes++; return removeClass.call(this, cls); };
    const addClass = p.AddClass;
    p.AddClass = function (cls) { if (p === frame && cls === "NSIntro" && shownAt < 0) shownAt = w.harness.now; return addClass.call(this, cls); };
  }
  for (const phase of [0, 350, 700]) {
    w.selectScreen("Team1Screen");
    w.advance(3000 + phase);
    assert.ok(hiddenNow(), `off screen for 3 s: reset to hidden (phase ${phase})`);
    shownAt = -1;
    const pickedAt = w.harness.now;
    w.selectScreen("ScoreboardScreen");
    w.advance(1500);
    assert.ok(shownAt >= 0 && shownAt - pickedAt <= 200, `entrance played ${shownAt - pickedAt} ms after the pick (phase ${phase})`);
    assert.ok(shownNow(), "board shown after the entrance");
  }
  w.selectScreen("Team1Screen");
  w.advance(500);
  assert.ok(shownNow(), "still shown while the carousel moves it away");
  w.selectScreen("ScoreboardScreen");
  w.advance(1500);
  assert.ok(shownNow(), "a quick return keeps the board shown");
  assert.equal(flashes, 0, "nothing on the focused Scoreboard screen was hidden after it showed");
  // Hidden: one cheap visibility check per second. Live (pak10 1c5ff983, 2026-10-25) reopening a match
  // this session had already loaded brought no CitadelMatchDetailsUpdated, and picking the Scoreboard
  // screen then woke nothing: a board that slept while hidden showed the previous match.
  w.page.RemoveClass("PageVisible");
  w.advance(6000);
  reset(w);
  stop = counted(w.harness);
  w.advance(10000);
  const hiddenOps = per(stop(), 10);
  console.log(`   board hidden ${weighted(hiddenOps)} us/s, ${total(hiddenOps)} calls/s ${JSON.stringify(hiddenOps)}`);
  assert.equal((hiddenOps.textWrites || 0) + (hiddenOps.styleWrites || 0) + (hiddenOps.classWrites || 0), 0, "no writes while hidden");
  assert.ok(weighted(hiddenOps) <= BUDGET_BOARD.hiddenUs, `board hidden: ${weighted(hiddenOps)} us/s`);
  results.board = { shown: shownOps, shownUs: weighted(shownOps), shownCalls: total(shownOps), hidden: hiddenOps, hiddenUs: weighted(hiddenOps) };
  // A cached match reopened: the rows change and the page shows, with no event at all.
  const b = pgMatch(121880956, { swap: true });
  w.fill(b);
  w.page.AddClass("PageVisible");
  w.advance(1100);
  assert.equal(w.shown(), 2, "the reopened match is built within a second of the page showing");
  assert.equal(w.text("NSMatch"), `MATCH ${b.id}`);
  // And the next match's event still acts at once.
  const c = pgMatch(121999999);
  w.fill(c);
  w.fire("CitadelMatchDetailsUpdated", c.id);
  w.advance(300);
  assert.equal(w.shown(), 3, "built within 0.3 s of the match event");
});

check("board: a layout reload keeps one loop and one match listener", () => {
  const w = boardWorld();
  w.boot();
  w.reload();
  assert.equal(w.bus.filter((entry) => entry.name === "CitadelMatchDetailsUpdated").length, 1, "one match listener");
  const a = pgMatch(121917141);
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  // Settled: the scans and the one-off asks to the save page (the rows, then each player's item purchases) are done.
  w.advance(40000);
  assert.equal(w.shown(), 1, "one build");
  reset(w);
  const stop = counted(w.harness);
  w.advance(10000);
  const ops = per(stop(), 10);
  assert.ok((ops.schedules || 0) <= 1.1, `one 1 s loop: ${ops.schedules} schedules/s`);
});

const present = (w, m) => { w.fill(m); w.fire("CitadelMatchDetailsUpdated", m.id); w.advance(300); };
const noBoardErrors = (w) => !w.harness.logs.some((line) => /tick failed/i.test(line));

check("board: the header shows the stock game mode on its own line over the match id, also when it binds late; an unbound label shows the id alone", () => {
  // User 2026-11-14: Standard / Ranked was not shown (the board hides the stock .MatchMode label).
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] } });
  w.boot();
  const modes = () => w.page.FindChildTraverse("ScoreboardScreen").Children().filter((k) => k.BHasClass("MatchMode"));
  const m = pgMatch(121917141);
  present(w, m);
  assert.equal(w.text("NSMatch"), "MATCH 121917141", "unbound {s:match_mode}: the id alone");
  assert.equal(w.text("NSMode"), "", "and no mode line");
  for (const k of modes()) bindAll(k, "{s:match_mode}");
  w.page.__dialog.match_mode = "Ranked";
  w.advance(4000);
  // The mode on its own line over the id (one line was cut with an ellipsis, user 2026-11-23).
  deq([w.text("NSMode"), w.text("NSMatch")], ["RANKED", "MATCH 121917141"], "a late bind is picked up");
  const n = pgMatch(121880956, { swap: true, win: 2 });
  present(w, n);
  w.page.__dialog.match_mode = "Standard";
  w.advance(4000);
  deq([w.text("NSMode"), w.text("NSMatch")], ["STANDARD", "MATCH 121880956"], "the next match shows its own mode");
});

check("board: the soul lead is one smooth line over a soft area on a canvas, coloured by who leads, with objective dots on the line, both peaks and the final lead", () => {
  // User 2026-10-26: "reimagine the graph and don't make this bars".
  // How it could fail: bars come back; the line misses a scanned point or swings past it between points
  // (an overshoot invents a lead nobody had); a lead change is drawn in one colour or leaves a gap at zero;
  // a point is NaN or off the canvas; a dot, peak or final-lead label sits away from the line or names the
  // wrong side; the captions miss the header's team names or keep stale ones; the reveal never finishes.
  const m = pgMatch(121685912);
  const T = m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  // Team 1 ahead for the first half (peak +12.5K), team 2 for the second (peak -12.5K); the totals decide the end.
  // A two-column fight spike at 30-33 % tests that the line does not swing past the points around it.
  const bump = (f) => Math.round(6250 * Math.sin(2 * Math.PI * f)) + (f > 0.29 && f < 0.335 ? 2500 : 0);
  const duration = m.minutes * 60 + m.seconds;
  const lanes = [[[300, 520], [700, -1], [-1, -1]], [[410, 600], [800, 1200], [-1, 1300]], [[350, -1], [-1, -1], [-1, -1]]];
  const w = boardWorld({ graph: { duration, souls: T, values: (f) => [Math.round(T[0] * f) + bump(f), Math.round(T[1] * f) - bump(f)], lanes } });
  w.boot();
  w.fill(m);
  w.fire("CitadelMatchDetailsUpdated", m.id);
  w.advance(30000);
  const host = w.boardHost();
  const canvas = host.FindChildTraverse("NSGraphCanvas");
  assert.ok(canvas && canvas.paneltype === "UICanvas", "drawn on a UICanvas");
  const geoLine = w.harness.logs.find((l) => l.startsWith("[DPS] graph: chart ")) || "";
  const geo = /chart (\d+)x(\d+), zero (\d+), half (\d+), scale (\d+)/.exec(geoLine);
  assert.ok(geo, `geometry logged: ${geoLine}`);
  const [W, H, Z, HALF, SCALE] = geo.slice(1).map(Number);
  const logged = (kind) => w.harness.logs.filter((l) => l.startsWith(`[DPS] data ${kind} + `)).map((l) => JSON.parse(l.slice(`[DPS] data ${kind} + `.length)));
  const lead = logged("series").map((p) => ({ x: p.t / duration * W, y: Z - (p.a - p.b) / SCALE * HALF, l: p.a - p.b }));
  assert.ok(lead.length >= 30 && lead.some((p) => p.l > 0) && lead.some((p) => p.l < 0), "the test lead changes sides");
  const draws = canvas.__draws || [];
  for (const d of draws) {
    assert.equal(d.pts.length, d.n * 2, "nPoints matches the array");
    assert.ok(d.pts.every(Number.isFinite), "finite points");
    for (let i = 0; i < d.pts.length; i += 2) assert.ok(d.pts[i] >= -0.5 && d.pts[i] <= 1600.5 && d.pts[i + 1] >= -0.5 && d.pts[i + 1] <= H + 0.5, `on the canvas: ${d.pts[i]},${d.pts[i + 1]}`);
    assert.match(String(d.color), /^#[0-9A-F]{8}$/i, "colours are #RRGGBBAA");
  }
  const team = (color) => { const n = parseInt(color.slice(1, 7), 16); return ((n >> 16) & 255) > (n & 255) ? 1 : 2; };
  // The area is drawn as zig-zags (every point pair shares its x); the line is the thin opaque polyline.
  const zigzag = (d) => { for (let i = 0; i + 2 < d.pts.length; i += 4) if (d.pts[i] !== d.pts[i + 2]) return false; return d.n >= 4; };
  // Amber (team 1 ahead) stays above zero, blue below; the runs meet at zero.
  const lines = draws.filter((d) => d.thickness <= 4 && /FF$/i.test(d.color) && d.n > 2 && !zigzag(d));
  assert.ok(lines.some((d) => team(d.color) === 1) && lines.some((d) => team(d.color) === 2), "both colours");
  for (const d of lines) for (let i = 1; i < d.pts.length; i += 2) assert.ok(team(d.color) === 1 ? d.pts[i] <= Z + 0.6 : d.pts[i] >= Z - 0.6, "a run stays on its side of zero");
  assert.ok(lines.some((d) => Math.abs(d.pts[1] - Z) < 0.6 && d.pts[0] > 1) && lines.some((d) => Math.abs(d.pts[d.pts.length - 1] - Z) < 0.6 && d.pts[d.pts.length - 2] < W - 1), "the runs meet at zero where the lead changes sides");
  const all = [];
  for (const d of lines) for (let i = 0; i < d.pts.length; i += 2) all.push([d.pts[i], d.pts[i + 1]]);
  all.sort((p, q) => p[0] - q[0]);
  const yAt = (x) => {
    const k = all.findIndex((p) => p[0] >= x);
    if (k <= 0) return all[Math.max(0, k)][1];
    const [x0, y0] = all[k - 1];
    const [x1, y1] = all[k];
    return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  };
  for (const p of lead) assert.ok(Math.abs(yAt(p.x) - p.y) <= 1.5, `through (${p.x.toFixed(1)}, ${p.y.toFixed(1)}): ${yAt(p.x).toFixed(1)}`);
  const knots = [{ x: 0, y: Z }].concat(lead);
  for (let i = 1; i < knots.length; i++) {
    const lo = Math.min(knots[i - 1].y, knots[i].y) - 0.6;
    const hi = Math.max(knots[i - 1].y, knots[i].y) + 0.6;
    for (const [x, y] of all) if (x > knots[i - 1].x + 0.01 && x < knots[i].x - 0.01) assert.ok(y >= lo && y <= hi, `no swing past the points between ${i - 1} and ${i} (${y.toFixed(1)} outside ${lo.toFixed(1)}..${hi.toFixed(1)})`);
  }
  // The soft area under the line, in both colours.
  const fills = draws.filter(zigzag);
  assert.ok(fills.some((d) => team(d.color) === 1) && fills.some((d) => team(d.color) === 2), "the area under the line in both colours");
  // Objective dots sit on the line in the colour of the team that took the objective.
  const events = logged("events");
  assert.ok(events.length >= 8, `objectives read: ${events.length}`);
  const px = (p, key) => parseFloat(String(p.style[key] || "0"));
  const dots = findAll(host, "Panel").filter((p) => p.valid && p.classes.has("NSGraphObj"));
  assert.equal(dots.length, events.length, "one dot per objective");
  events.forEach((e, i) => {
    const dot = dots[i];
    const cx = px(dot, "marginLeft") + 5;
    const cy = px(dot, "marginTop") + 5;
    assert.ok(Math.abs(cx - e.t / duration * W) <= 1.5 && Math.abs(cy - yAt(cx)) <= 2, `objective ${i} on the line`);
    assert.ok(dot.classes.has(e.killer === 2 ? "NSObjTeam2" : "NSObjTeam1"), `objective ${i} in the taker's colour`);
  });
  // Peaks and the final lead.
  const text = (p) => String(p.__text ?? p.text ?? "");
  const best = (sign) => lead.reduce((b, p) => (sign * p.l > sign * b.l ? p : b), { l: 0 });
  for (const [sign, side] of [[1, 1], [-1, 2]]) {
    const peak = host.FindChildTraverse(`NSGraphPeak${side}`);
    assert.ok(peak && peak.classes.has("NSOn"), `team ${side} peak shown`);
    assert.ok(text(peak).includes(`+${(Math.abs(best(sign).l) / 1000).toFixed(1)}K`), `team ${side} peak value: ${text(peak)}`);
  }
  const last = lead[lead.length - 1];
  const end = host.FindChildTraverse("NSGraphEnd");
  assert.equal(text(end), `+${(Math.abs(last.l) / 1000).toFixed(1)}K`, "the final lead");
  assert.ok(end.classes.has(last.l < 0 ? "NSEndTeam2" : "NSEndTeam1"), "in the leader's colour");
  assert.ok(Math.abs(px(end, "marginTop") + 11 - Math.max(11, Math.min(H - 11, last.y))) <= 2, "level with the line's end");
  // Captions name the header's teams.
  assert.ok(text(host.FindChildTraverse("NSGraphTop")).includes("HIDDEN KING") && text(host.FindChildTraverse("NSGraphBottom")).includes("ARCHMOTHER"), "captions from the header");
  // No match cards here: a forged Observer HUD handoff (OHM1 on ClientUI_FireOutput) changes nothing.
  w.fire("ClientUI_FireOutput", `OHM1:${JSON.stringify({ a: m.teams[0].map((p) => Number(p.account)), b: m.teams[1].map((p) => Number(p.account)), t: [["Night Owls", "NOW", ""], ["Brass Saints", "BRS", ""]], r: ["", ""], w: 0, id: "", at: 7000 })}`);
  w.advance(500);
  assert.ok(text(host.FindChildTraverse("NSGraphTop")).includes("HIDDEN KING") && text(host.FindChildTraverse("NSGraphBottom")).includes("ARCHMOTHER"), "captions keep the stock names");
  // The reveal finishes.
  assert.equal(String(host.FindChildTraverse("NSGraphDraw").style.clip), "none", "fully revealed: no clip, so the pill may pass the paper");
  // How it failed live (2026-10-29, 1600x900): 1 px strokes are 0.83 screen px at UI scale 0.83 and drop out
  // by sub-pixel position (the 5:00 guide and most objective drop lines were missing). Nothing under 2 px.
  const painted = host.FindChildTraverse("NSGraphCanvas").__draws || [];
  assert.ok(painted.length >= 10, `strokes painted: ${painted.length}`);
  const thin = painted.filter((d) => d.thickness < 2);
  deq(thin.map((d) => `${d.thickness}px ${d.color}`), [], "every canvas stroke is at least 2 px");
  // The drop lines (user 2026-10-29: the canvas part and the part below the paper did not match): none on the
  // canvas; one panel per objective from 7 px under its dot to 4 px into its icon, centred on the dot.
  deq(painted.filter((d) => d.color === "#FFEFD722").map((d) => d.pts), [], "no drop line on the canvas");
  const stems = host.FindChildTraverse("NSGraphStems").children.filter((c) => c.valid);
  const icons = host.FindChildTraverse("NSGraphEvents").children.filter((c) => c.valid);
  const objDots = host.FindChildTraverse("NSGraphMarks").children.filter((c) => c.valid && c.classes.has("NSGraphObj"));
  assert.ok(icons.length >= 5 && stems.length === icons.length && objDots.length === icons.length, `stems ${stems.length}, icons ${icons.length}, dots ${objDots.length}`);
  for (const d of objDots) {
    const cx = px(d, "marginLeft") + 5;
    const cy = px(d, "marginTop") + 5;
    const stem = stems.find((st) => Math.abs(px(st, "marginLeft") + 1 - cx) < 0.6);
    assert.ok(stem, `a stem under the dot at x ${cx}`);
    assert.ok(Math.abs(px(stem, "marginTop") - (cy + 7)) < 0.6, `stem starts under its dot: ${px(stem, "marginTop")} vs ${cy + 7}`);
    assert.ok(Math.abs(px(stem, "marginTop") + px(stem, "height") - 134) < 0.6, "stem ends 4 px into the icon");
  }
  assert.ok(noBoardErrors(w));
});

check("board: a Street Brawl game then a 6v6 shows all 12 players when the old totals row is reused as a player row", () => {
  // User 2026-11-14: after a 4v4 Street Brawl a ranked 6v6 showed 5 columns a side. The 4v4 totals row
  // (hidden by the board) came back as player row 5, still hidden by the board's inline style.
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] } });
  w.boot();
  const brawl = pgMatch(136872372);
  brawl.teams = brawl.teams.map((t) => t.slice(0, 4));
  w.fill(brawl);
  const players = (t) => w.scoreboard.FindChildTraverse(`Team${t}`).FindChildTraverse("TeamPlayers");
  for (const t of [1, 2]) players(t).children.splice(4, 2); // 4 players + totals
  w.fire("CitadelMatchDetailsUpdated", brawl.id);
  w.advance(30000);
  assert.equal(w.columns().length, 8, "the 4v4 board");
  // C++ reuses the 5 rows for the 6v6: the old totals row becomes player 5, two rows are added.
  const playerRow = (parent) => {
    const row = new MockPanel("Panel", parent, "");
    const commend = new MockPanel("Panel", row, "");
    commend.classes.add("CommendContainer");
    new MockPanel("Button", commend, "CommendPlayerButton");
    new MockPanel("Panel", row, "StatCells");
    const main = new MockPanel("Panel", row, "PlayerInfo");
    return { row, main };
  };
  for (const t of [1, 2]) {
    const old = players(t).children[4];
    old.classes.delete("TotalsRow");
    const main = old.FindChildTraverse("PlayerInfo");
    new MockPanel("Label", new MockPanel("CitadelUserName", main, "PlayerName"), "");
    const items = new MockPanel("Panel", main, "ItemsContainer");
    for (let i = 0; i < 9; i++) new MockPanel("CitadelModIcon", items, "");
    const sixth = playerRow(players(t));
    new MockPanel("Label", new MockPanel("CitadelUserName", sixth.main, "PlayerName"), "");
    const items6 = new MockPanel("Panel", sixth.main, "ItemsContainer");
    for (let i = 0; i < 9; i++) new MockPanel("CitadelModIcon", items6, "");
    playerRow(players(t)).row.classes.add("TotalsRow");
  }
  const ranked = pgMatch(132833001);
  w.fill(ranked);
  w.fire("CitadelMatchDetailsUpdated", ranked.id);
  w.advance(30000);
  assert.equal(w.columns().length, 12, "12 columns");
  for (const t of [1, 2]) {
    const rows = players(t).children;
    const shown = rows.filter((r) => !r.classes.has("TotalsRow") && String(r.style.visibility) !== "collapse");
    assert.equal(shown.length, 6, `team ${t}: 6 player rows drawn (${rows.map((r) => String(r.style.visibility)).join(",")})`);
    assert.equal(String(rows.find((r) => r.classes.has("TotalsRow")).style.visibility), "collapse", "the new totals row is hidden");
  }
  assert.ok(noBoardErrors(w));
});

check("board: the stock commend button stays in its row, floats over the card and shows only while the card is hovered", () => {
  // User 2026-11-14: the board hid the row's .CommendContainer with the other stock row children.
  const w = boardWorld();
  w.boot();
  w.advance(1000);
  present(w, pgMatch(121685912));
  w.advance(3000);
  const rows = w.scoreboard.FindChildTraverse("Team1").FindChildTraverse("TeamPlayers").children;
  const row = rows[0];
  const box = row.children.find((k) => k.classes.has("CommendContainer"));
  const button = box.FindChildTraverse("CommendPlayerButton");
  assert.equal(box.GetParent(), row, "never reparented");
  assert.notEqual(String(box.style.visibility), "collapse", "the container is not hidden");
  assert.equal(String(box.style.margin), "0px 0px -56px 0px", "it takes no room in the column");
  assert.equal(String(button.style.opacity), "0", "hidden until the card is hovered");
  assert.equal(String(button.style.horizontalAlign), "left", "commend at the portrait's top left (user 2026-11-23)");
  assert.equal(String(box.FindChildTraverse("LocalPlayerIdentifier").style.visibility), "collapse", "no stock local-player caret on the card");
  // The stock Create Build button: in its own parent, moved before the board's column, top right, hidden until hovered.
  const build = row.FindChildTraverse("CopyBuildButton");
  const main = row.FindChildTraverse("ItemsContainer").GetParent();
  assert.equal(build.GetParent(), main, "Create Build never reparented");
  const column = main.children.find((k) => k.classes.has("NSColumnTeam1"));
  assert.equal(main.children.indexOf(build), main.children.indexOf(column) - 1, "just before the column, over the portrait");
  deq([String(build.style.visibility), String(build.style.horizontalAlign), String(build.style.margin), String(build.style.opacity)],
    ["visible", "right", "4px 4px -32px 0px", "0"], "top right, no room taken, hidden until hovered");
  // Symmetric with commend: the same 28 px round button, 4 px in from its corner (user 2026-11-23).
  deq([build.style.width, build.style.height, button.style.width, button.style.height, button.style.margin, String(button.style.horizontalAlign)],
    ["28px", "28px", "28px", "28px", "4px 0px 0px 4px", "left"], "same size, mirrored inset");
  assert.equal(typeof row.events.onmouseover, "function", "the card listens for the mouse");
  let reads = 0;
  row.BHasHoverStyle = function () { reads++; return !!this.hovered; };
  row.hovered = true;
  row.events.onmouseover();
  w.advance(300);
  assert.equal(String(button.style.opacity), "1", "shown while the card is hovered");
  assert.equal(String(build.style.opacity), "1", "Create Build shown with it");
  rows[1].hovered = true;
  row.hovered = false;
  rows[1].BHasHoverStyle = function () { return !!this.hovered; };
  rows[1].events.onmouseover();
  const other = rows[1].children.find((k) => k.classes.has("CommendContainer")).FindChildTraverse("CommendPlayerButton");
  deq([String(button.style.opacity), String(other.style.opacity)], ["0", "1"], "the mouse moved to the next card");
  rows[1].hovered = false;
  w.advance(300);
  assert.equal(String(other.style.opacity), "0", "hidden once the mouse left");
  assert.equal(String(build.style.opacity), "0", "Create Build hidden on the other card");
  const after = reads;
  w.advance(5000);
  assert.equal(reads, after, "nothing is polled once the mouse left");
  assert.ok(noBoardErrors(w));
});

check("board: a hovered item is drawn over its neighbours and the next players' items; it drops back when the mouse leaves", () => {
  // Live (client 6819, 2026-10-26): the stock :hover scales an item 1.5x; later siblings (the next item, the
  // next wrapped row, the next player's column) drew over it. ItemsContainer gets onmouseover/onmouseout when
  // any of its items is hovered, BHasHoverStyle names the item and an inline z-index lifts it.
  const w = boardWorld();
  w.boot();
  w.advance(1000);
  present(w, pgMatch(121685912));
  w.advance(3000);
  const rows = w.scoreboard.FindChildTraverse("Team1").FindChildTraverse("TeamPlayers").children;
  const items = rows[0].FindChildTraverse("ItemsContainer");
  const icons = items.children;
  const z = (p) => String(p.style.zIndex ?? "");
  const chain = [];
  for (let p = items; p && p !== w.scoreboard; p = p.GetParent()) chain.push(p);
  assert.equal(typeof items.events.onmouseover, "function", "the items listen for the mouse");
  icons[2].hovered = true;
  items.hovered = true;
  items.events.onmouseover();
  w.advance(100);
  assert.equal(z(icons[2]), "1", "the hovered item is above the other items");
  assert.ok(icons.every((p, i) => i === 2 || z(p) !== "1"), "only that item");
  for (const p of chain) assert.equal(z(p), "1", `${p.id || p.paneltype} is above its siblings (the next players' items)`);
  icons[2].hovered = false;
  icons[4].hovered = true;
  w.advance(100);
  deq([z(icons[4]), z(icons[2])], ["1", "0"], "the mouse moved to another item of the same player");
  let reads = 0;
  for (const icon of icons) icon.BHasHoverStyle = function () { reads++; return !!this.hovered; };
  icons[4].hovered = false;
  items.hovered = false;
  items.events.onmouseout();
  w.advance(100);
  assert.ok(icons.every((p) => z(p) !== "1") && chain.every((p) => z(p) === "0"), "all back down");
  const after = reads;
  w.advance(5000);
  assert.equal(reads, after, "nothing is polled once the mouse left");
  assert.ok(noBoardErrors(w));
});

// ---------------------------------------------------------------- standalone pak (pak11)

const SHIPPED = (() => {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(path.join(MODULE, "panorama"), full).replace(/\\/g, "/"));
    }
  };
  walk(path.join(MODULE, "panorama"));
  return out.sort();
})();

// Stat timeline (user 2026-11-23): hovering the lead graph shows the board at that graph column. The mock
// tooltips follow the live 6864 probe (detailed_postgame/live/20261123-graph-probe-6864.log): general graphs list every player
// by colour bar only (0 left out; 20261123-tooltip-rows-probe-6864.log), Souls by Source and Damage Breakdown are per picked button.
// world: items (p, k) => sets p.items (the icons' names), api (m) => deadlock-api's matches, apiDown.
function timelineWorld(extra = {}, world = {}) {
  const m = pgMatch(121685912);
  if (world.items) m.teams.flat().forEach(world.items);
  const totals = m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  const duration = m.minutes * 60 + m.seconds;
  const w = boardWorld({ graph: Object.assign({ duration, souls: totals, timeline: true, sides: "button", lag: 1,
    // other ids than the live ones: the board must find each graph by its dropdown label
    typeIds: { Kills: 21, Deaths: 22, Healing: 23, "Souls by Source": 24, "Damage Breakdown": 25, "Healing by Type": 26 } }, extra), api: world.api ? world.api(m) : {} });
  if (world.apiDown) w.web.apiDown = true;
  w.boot();
  w.fill(m);
  w.fire("CitadelMatchDetailsUpdated", m.id);
  w.advance(30000);
  const players = m.teams.flat();
  const cols = w.columns();
  const cell = (k, key) => {
    const box = findAll(cols[k], "Panel").find((p) => p.classes.has(`NSCell_${key}`));
    return { box, text: box.children[0].__text };
  };
  const strips = () => w.boardHost().FindChildTraverse("NSGraphStrips").children;
  const timeAt = (c) => Math.round(((c + 1) / 40) * duration);
  const clockOf = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  const srcNames = (k) => findAll(cols[k], "Panel").filter((p) => p.classes.has("NSSrc") && p.style.visibility !== "collapse")
    .map((p) => p.children[1].__text);
  return { m, w, players, cols, cell, strips, timeAt, clockOf, srcNames, duration };
}

check("board: hovering the lead graph shows every column's souls, kills, deaths, damage, healing and sources; assists stay final; leaving restores", () => {
  const { w, players, cols, cell, strips, timeAt, clockOf, srcNames } = timelineWorld();
  const logs = w.harness.logs;
  const done = logs.find((l) => l.startsWith("[DPS] timeline done"));
  assert.ok(done, `timeline finished: ${logs.filter((l) => l.includes("timeline")).slice(0, 6).join(" / ")}`);
  assert.match(done, / 0 failed: souls 12\/12, kills 12\/12, deaths 12\/12, pdmg 12\/12, odmg 12\/12, heal 12\/12, src 12\/12, dtype 12\/12, taken 12\/12; \d+ twin column\(s\) ordered by growth$/);
  assert.ok(logs.some((l) => /^\[DPS\] timeline: \d+ steps, 40 columns, 12 players, 8 player colours, shared by \d+\+\d+ \d+\+\d+$/.test(l)), "two shared colours");
  // Every column, every player, every stat (the data lines are the live E2E artifact), twins included.
  const data = logs.filter((l) => l.startsWith("[DPS] data timeline + ")).map((l) => JSON.parse(l.slice("[DPS] data timeline + ".length)));
  assert.equal(data.length, 40, "one data line per column");
  const keys = ["net_worth", "player_kills", "player_deaths", "player_dmg", "obj_dmg", "player_healing"];
  // Players 3 and 6, 7 and 10 share a colour (as live): their souls and kills are put back by their own Souls by
  // Source growth, exactly; their deaths and healing (no per-player guide) may swap within the pair, never leave it.
  const twin = { 3: 6, 6: 3, 7: 10, 10: 7 };
  data.forEach((col, c) => {
    assert.equal(col.t, timeAt(c), `time of column ${c}`);
    // The last column is the scoreboard's, but healing stays the graph's (no barrier) there too.
    const want = (p) => keys.map((key) => (c === 39 && key !== "player_healing" ? p[key] : Math.round((key === "player_healing" ? Math.round(p[key] * 0.9) : p[key]) * ((c + 1) / 40))));
    players.forEach((p, k) => {
      const got = col.p[k].slice(0, 7); // [hero, six stats]; the 8th is the souls-by-source total
      if (!(k in twin)) { deq(got, [p.hero, ...want(p)], `column ${c} player ${k}`); return; }
      deq(got.filter((_, i) => i !== 3 && i !== 6), [p.hero, ...want(p)].filter((_, i) => i !== 3 && i !== 6), `column ${c} twin ${k} (all but deaths, healing)`);
      for (const i of [3, 6]) deq([got[i], col.p[twin[k]][i]].sort(), [want(p)[i - 1], want(players[twin[k]])[i - 1]].sort(), `column ${c} twin ${k} stat ${i} as a pair`);
    });
  });
  assert.equal(w.tipLog.opaqueFrames, 0, "tooltip never drawn while the timeline is read");
  assert.ok(!w.tipDrawn(), "nothing drawn after the timeline");
  // The stock graph is put back the way it opens: Souls Collected, by team.
  assert.equal(w.page.FindChildTraverse("TypeDropDown").GetSelected().id, "type_0");
  assert.equal(strips().length, 40, "one hit strip per graph column");
  assert.ok(strips().every((s) => s.attributes.hittest === "true"), "the strips take the mouse");
  const final = cols.map((_, k) => Object.fromEntries(["souls", "kills", "deaths", "assists", "pdmg", "odmg", "heal"].map((key) => [key, cell(k, key).text])));
  const finalSrc = cols.map((_, k) => srcNames(k));
  const head = () => ["NSWorth1", "NSKills1", "NSWorth2", "NSKills2", "NSClock"].map((id) => w.text(id));
  const finalHead = head();
  const fmt = (v) => v.toLocaleString("en-US");
  const fmtK = (v) => `${(v / 1000).toFixed(1)}K`;

  // Column 19 of 40 (f = 0.5): every value the graphs gave at that moment.
  const c = 19;
  strips()[c].events.onmouseover();
  players.forEach((p, k) => {
    assert.equal(cell(k, "souls").text, fmt(Math.round(p.net_worth * 0.5)), `souls ${k}`);
    assert.equal(cell(k, "kills").text, String(Math.round(p.player_kills * 0.5)), `kills ${k}`);
    if (![3, 6, 7, 10].includes(k)) assert.equal(cell(k, "deaths").text, String(Math.round(p.player_deaths * 0.5)), `deaths ${k}`);
    assert.equal(cell(k, "pdmg").text, fmt(Math.round(p.player_dmg * 0.5)), `player damage ${k}`);
    assert.equal(cell(k, "odmg").text, fmt(Math.round(p.obj_dmg * 0.5)), `objective damage ${k}`);
    if (![3, 6, 7, 10].includes(k)) assert.equal(cell(k, "heal").text, fmt(Math.round(Math.round(p.player_healing * 0.9) * 0.5)), `healing ${k}`);
    assert.equal(cell(k, "assists").text, final[k].assists, `assists stay final ${k}`);
    assert.ok(cell(k, "assists").box.classes.has("NSCellFinal"), `assists dimmed ${k}`);
    assert.ok(!cell(k, "kills").box.classes.has("NSCellFinal"), `kills not dimmed ${k}`);
    const souls = Math.round(p.net_worth * 0.5);
    const kills = Math.min(300 * Math.round(p.player_kills * 0.5), Math.round(souls * 0.3));
    const src = [["Troopers", Math.round(souls * 0.6)], ["Enemy Kills", kills], ["Neutrals", Math.round(souls * 0.97) - Math.round(souls * 0.6) - kills]];
    deq(srcNames(k), src.filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).map(([name]) => name), `sources at the column ${k}`);
    assert.ok(cols[k].classes.has("NSAtTime"), "the column reads as a past moment");
  });
  const half = (key, t) => players.filter((_, k) => (t === 0 ? k < 6 : k >= 6)).reduce((s, p) => s + Math.round(p[key] * 0.5), 0);
  deq(head(), [fmtK(half("net_worth", 0)), String(half("player_kills", 0)), fmtK(half("net_worth", 1)), String(half("player_kills", 1)), clockOf(timeAt(c))]);
  assert.equal(w.text("NSLabelAssists"), "ASSISTS (FINAL)");
  const hover = w.boardHost().FindChildTraverse("NSGraphHover");
  assert.ok(hover.classes.has("NSHoverOn"), "cursor shown");
  assert.ok(w.text("NSGraphChip").startsWith(clockOf(timeAt(c))), `chip: ${w.text("NSGraphChip")}`);

  // Strip to strip: the old one's mouseout never flashes the final numbers in between.
  strips()[c].events.onmouseout();
  strips()[c + 1].events.onmouseover();
  w.advance(200);
  assert.equal(w.text("NSClock"), clockOf(timeAt(c + 1)), "next column shown");
  assert.ok(hover.classes.has("NSHoverOn"));

  // The last column is the scoreboard's exact final numbers (only assists dimmed); healing the graph's, as labelled.
  strips()[c + 1].events.onmouseout();
  strips()[39].events.onmouseover();
  players.forEach((p, k) => {
    for (const key of ["souls", "kills", "deaths", "pdmg", "odmg"]) assert.equal(cell(k, key).text, final[k][key], `last column ${key} ${k}`);
    assert.equal(cell(k, "heal").text, fmt(Math.round(p.player_healing * 0.9)), `last column healing without barrier ${k}`);
  });
  assert.equal(w.text("NSLabelHeal"), "HEALING (NO BARRIER)");
  deq(head().slice(0, 4), finalHead.slice(0, 4), "last column: the totals rows");

  // Leaving the graph brings everything back.
  strips()[39].events.onmouseout();
  w.advance(200);
  cols.forEach((_, k) => {
    for (const key of Object.keys(final[k])) {
      assert.equal(cell(k, key).text, final[k][key], `restored ${key} ${k}`);
      assert.ok(!cell(k, key).box.classes.has("NSCellFinal"), `undimmed ${key} ${k}`);
    }
    deq(srcNames(k), finalSrc[k], `final sources ${k}`);
    assert.ok(!cols[k].classes.has("NSAtTime"));
  });
  deq(head(), finalHead, "header restored");
  assert.equal(w.text("NSLabelAssists"), "ASSISTS");
  assert.equal(w.text("NSLabelHeal"), "HEALING");
  assert.ok(!hover.classes.has("NSHoverOn"), "cursor hidden");
});

check("board: a graph that never matches the scoreboard is left out of the timeline: its cells stay final and dimmed, the rest still move", () => {
  // Kills that never reach the scoreboard's numbers (another match's graph, a late switch that never lands).
  const { w, players, cell, strips } = timelineWorld({
    timeline: (p, f, key) => (key === "kills" ? Math.round((p.player_kills + 1) * f) : Math.round((key === "heal" ? Math.round(p.player_healing * 0.9) : p[{ souls: "net_worth", deaths: "player_deaths", pdmg: "player_dmg", odmg: "obj_dmg" }[key]]) * f))
  });
  const done = w.harness.logs.find((l) => l.startsWith("[DPS] timeline done"));
  assert.match(done, /souls 12\/12, kills 0\/12, deaths 12\/12/);
  assert.ok(w.harness.logs.some((l) => l.startsWith("[DPS] timeline: kills unread")), "the unread graph is logged");
  const finalKills = players.map((_, k) => cell(k, "kills").text);
  strips()[19].events.onmouseover();
  players.forEach((p, k) => {
    assert.equal(cell(k, "kills").text, finalKills[k], `kills stay final ${k}`);
    assert.ok(cell(k, "kills").box.classes.has("NSCellFinal"), `kills dimmed ${k}`);
    assert.equal(cell(k, "deaths").text, String(Math.round(p.player_deaths * 0.5)), `deaths still move ${k}`);
  });
});

check("board: a pick that drifts to another player mid-read is caught (a total going down, or a changed last column) and read again", () => {
  const { w, players } = timelineWorld({ drift: { type: "Damage Breakdown", pick: 12, col: 34, to: 4 } });
  const logs = w.harness.logs;
  assert.ok(logs.some((l) => /^\[DPS\] timeline: dmg:12 \(hero \d+\) drifted \(.*\); read again$/.test(l)), "drift logged and read again");
  assert.match(logs.find((l) => l.startsWith("[DPS] timeline done")), / 0 failed: .*pdmg 12\/12, odmg 12\/12/);
  const data = logs.filter((l) => l.startsWith("[DPS] data timeline + ")).map((l) => JSON.parse(l.slice("[DPS] data timeline + ".length)));
  data.forEach((col, c) => {
    const p = players[11];
    const f = (c + 1) / 40;
    const want = c === 39 ? [p.player_dmg, p.obj_dmg] : [Math.round(p.player_dmg * f), Math.round(p.obj_dmg * f)];
    deq(col.p[11].slice(4, 6), want, `player 12's damage at column ${c}`);
  });
});

check("board: on a hovered column the best-of-12 bursts go to that moment's highest players in their stat colours; leaving puts the final ones back", () => {
  const field = { souls: "net_worth", kills: "player_kills", deaths: "player_deaths", pdmg: "player_dmg", odmg: "obj_dmg" };
  const end = (key, p) => (key === "heal" ? Math.round(p.player_healing * 0.9) : p[field[key]]);
  const first = pgMatch(121685912).teams[0][0].hero; // timelineWorld's match
  // Player 0 leads souls mid-game (a 3,750-soul bump at the half, gone at the end); every other stat grows evenly.
  const { w, players, cols, cell, strips } = timelineWorld({
    timeline: (p, f, key) => Math.round(end(key, p) * f + (key === "souls" && p.hero === first ? 15000 * f * (1 - f) : 0))
  });
  assert.ok(w.harness.logs.some((l) => l.startsWith("[DPS] timeline done")), "timeline read");
  const best = (k, key) => cell(k, key).box.classes.has("NSBest") && cell(k, key).box.classes.has(`NSBest_${key}`);
  const bests = (key) => players.map((_, k) => best(k, key));
  const finals = Object.fromEntries(["souls", "kills", "assists", "pdmg", "odmg", "heal"].map((key) => [key, bests(key)]));
  assert.ok(!finals.souls[0], "player 0 is not the final souls best");
  strips()[19].events.onmouseover();
  const shown = (k, key) => Number(cell(k, key).text.replace(/,/g, ""));
  for (const key of ["souls", "kills", "pdmg", "odmg", "heal"]) {
    const top = Math.max(...players.map((_, k) => shown(k, key)));
    deq(bests(key), players.map((_, k) => top > 0 && shown(k, key) === top), `${key} bursts on the column's highest`);
  }
  assert.ok(best(0, "souls"), "player 0 leads souls at the half and gets the burst");
  deq(bests("assists"), finals.assists, "assists keep the final bursts");
  assert.ok(!cols.some((c) => findAll(c, "Panel").some((p) => p.classes.has("NSCell_deaths") && p.classes.has("NSBest"))), "deaths never get one");
  // The hovered numbers keep their colours: no rule tints every value at a hovered time over the stat colours.
  assert.ok(!/\.NSAtTime\s+\.NSCellValue/.test(read("panorama/styles/detailed_postgame/pg_board.css")), "no blanket colour on hovered values");
  // Deaths read as bright as every other row (user 2026-11-23: "fix the death numbers being faded").
  assert.ok(!/\.NSCell_deaths[^{]*\{[^}]*opacity/.test(read("panorama/styles/detailed_postgame/pg_board.css")), "deaths are not dimmed");
  strips()[19].events.onmouseout();
  w.advance(200);
  for (const key of Object.keys(finals)) deq(bests(key), finals[key], `final ${key} bursts back`);
});

check("board: each player's 12 item cells as in game (items, empty slots, a lock per extra slot the team's Walker kills had not opened); buy times from deadlock-api only once asked; a graph hover leaves out what was not bought yet", () => {
  // User 2026-11-23: buy times ("check on deadlockapi"), extra-slot locks from the graph's Walker kills ("3 slot
  // conditional"), items not bought yet left out, no time on empty slots, the API only when needed, and a note
  // when the match is too new for deadlock-api.
  // Five bought items, one with no purchase record, three empty slots (the stock tooltip keeps the last name).
  const NAMES = ["Restorative Shot", "Healbane", "Close Quarters", "Berserker", "Decay", "Extra Stamina", "", "", ""];
  const buys = [["upgrade_medic_bullets", 64, 0], ["upgrade_close_range", 260, 1029], ["upgrade_rupture", 632, 0], ["upgrade_healbane", 632, 0],
    ["upgrade_close_range", 1100, 0], ["upgrade_berserker", 1681, 0]];
  const metadata = (m, skip) => ({ match_info: { players: m.teams.flat().filter((p) => p.hero !== skip).map((p) => ({ hero_id: p.hero,
    items: [{ item_id: 2460791803, game_time_s: 13, sold_time_s: 0 }].concat(buys.map(([cls, t, sold]) => ({ item_id: itemId(cls), game_time_s: t, sold_time_s: sold }))) })) } });
  // Walkers: team 2 kills one in each lane (8:20, 15:00, 20:00), team 1 one (11:40).
  const lanes = [[[-1, -1], [500, 700], [-1, -1]], [[-1, -1], [900, -1], [-1, -1]], [[-1, -1], [1200, -1], [-1, -1]]];
  // Player 2 starts with an empty slot: the last player's item still shows in the tooltip there.
  const world = (api, more = {}) => timelineWorld({ lanes }, Object.assign({ items: (p, i) => { p.items = i === 1 ? [""].concat(NAMES.slice(0, 8)) : NAMES.slice(); }, api }, more));
  const { m, w, strips, timeAt } = world((m) => ({ [m.id]: metadata(m, m.teams[0][3].hero) }));
  w.advance(30000);
  const logs = w.harness.logs;
  const said = (re) => logs.some((l) => re.test(l));
  assert.ok(said(/^\[DPS\] slots: 72 items, 36 empty, read in \d+ ms, \d+ frames$/), logs.filter((l) => /slots|scan done/.test(l)).join(" / "));
  assert.ok(logs.includes("[DPS] slots: extra slots open at the end 1/3 (Walkers at 11:40 / 8:20,15:00,20:00)"), logs.filter((l) => /slots/.test(l)).join(" / "));
  assert.ok(!(w.web.apiCalls || []).length, "deadlock-api is not asked before a hover");
  assert.ok(w.itemTip.shows >= 72 && w.itemTip.frames === 0, `the item tooltip never showed on screen (${w.itemTip.frames} of ${w.itemTip.shows})`);
  assert.equal(w.itemTip.layer().style.opacity, "1", "the tooltip layer is back");
  const items = (t, k) => w.scoreboard.FindChildTraverse(`Team${t + 1}`).FindChildTraverse("TeamPlayers").children[k].FindChildTraverse("ItemsContainer");
  // The stock icons stay in place as the cells (the game drops any other child of ItemsContainer): an item, a blank
  // cell (its own stack faded), or a blank cell with a lock.
  // A blank cell shows the empty-slot frame (#NSSlotCell); a locked one the lock in it.
  const cells = (t, k) => items(t, k).children.map((icon) => {
    const frame = icon.FindChild("NSSlotCell");
    if (icon.FindChild("modIconContainer").style.opacity !== "0") {
      assert.ok(!frame || frame.style.visibility === "collapse", "an item has no empty-slot frame");
      return icon.__itemName || "?";
    }
    assert.ok(frame && frame.style.visibility === "visible", "a blank cell is drawn as an empty slot");
    return frame.FindChildTraverse("NSSlotLock").style.visibility === "visible" ? "LOCK" : "-";
  });
  const six = NAMES.slice(0, 6);
  deq(cells(0, 0), six.concat(["-", "LOCK", "LOCK"]), "team 1 opened one extra slot: the last two empty slots are locked");
  deq(cells(1, 0), six.concat(["-", "-", "-"]), "team 2 opened all three");
  deq(cells(0, 1), six.concat(["-", "LOCK", "LOCK"]), "an empty first slot is not taken for the last player's item; the items first");
  assert.equal(items(0, 0).children[8].GetChild(0).id, "NSSlotCell", "the frame sits first in the icon, under its own stack");
  assert.ok(read("panorama/scripts/detailed_postgame/pg_board.js").includes('"s2r://panorama/images/upgrades/lock_icon_psd.vtex"'), "the stock item lock");

  // The first hover asks deadlock-api (once for all twelve players); the times arrive while hovering.
  w.selectScreen("ScoreboardScreen"); // the lead graph is hovered on the Scoreboard screen
  assert.equal(timeAt(19), 934);
  strips()[19].events.onmouseover();
  assert.equal(w.text("NSBuyNote"), "ITEM TIMES: ASKING DEADLOCK-API...");
  w.advance(3000);
  assert.equal(w.web.apiCalls.length, 1, "one fetch for the twelve players");
  assert.ok(!w.boardHost().FindChildTraverse("NSBuyNote").classes.has("NSBuyNoteOn"), "the note goes once the times are in");
  assert.ok(logs.includes("[DPS] buys: 55/72 items timed"), logs.filter((l) => /buys/.test(l)).join(" / "));
  // At 15:34: Close Quarters (18:20) and Berserker (28:01) not bought yet; team 1 had one Walker, team 2 two.
  // In the order bought (no time: after the timed ones), then the blank cells, the locks last (user 2026-11-23).
  deq(cells(0, 0), ["Restorative Shot", "Healbane", "Decay", "Extra Stamina", "-", "-", "-", "LOCK", "LOCK"], "not bought yet: blank; the locks on the last blank cells");
  deq(cells(1, 0), ["Restorative Shot", "Healbane", "Decay", "Extra Stamina", "-", "-", "-", "-", "LOCK"]);
  strips()[19].events.onmouseout();
  w.advance(200);
  deq(cells(0, 0), ["Restorative Shot", "Healbane", "Decay", "Close Quarters", "Berserker", "Extra Stamina", "-", "LOCK", "LOCK"], "the end again, in the order bought");
  const label = (icon) => icon.FindChild("modIconContainer").FindChild("NSBuyTime");
  const times = (t, k) => items(t, k).children.filter((p) => p.paneltype === "CitadelModIcon").map((icon) => (label(icon) ? label(icon).text : ""));
  deq(times(0, 0), ["1:04", "10:32", "10:32", "18:20", "28:01", "", "", "", ""], "kept items: the last purchase, in that order; no time on empty slots");
  deq(times(0, 3), Array(9).fill(""), "a player deadlock-api does not list: no times");
  // "17:23" was cut to "17..." in a 45 px icon shown at 75 % (user 2026-11-23): small enough to fit, never an ellipsis.
  const firstLabel = label(items(0, 0).children.find((p) => p.paneltype === "CitadelModIcon"));
  assert.ok(parseFloat(firstLabel.style.fontSize) <= 14 && firstLabel.style.textOverflow === "noclip", "buy time fits its icon: 14 px, noclip");
  // Shown on the hovered icon only, by the item hover poll.
  const box = items(0, 0);
  const icons = box.children.filter((p) => p.paneltype === "CitadelModIcon");
  assert.ok(icons.every((icon) => !label(icon) || label(icon).style.visibility === "collapse"), "hidden until hovered");
  icons[2].hovered = true;
  box.hovered = true;
  box.events.onmouseover();
  w.advance(100);
  deq(icons.slice(0, 5).map((icon) => label(icon).style.visibility), ["collapse", "collapse", "visible", "collapse", "collapse"], "the hovered icon's time");
  icons[2].hovered = false;
  box.hovered = false;
  w.advance(100);
  assert.equal(label(icons[2]).style.visibility, "collapse", "gone when the mouse leaves");

  // Another match on the same rows, then this one again: nothing left over, no second fetch.
  present(w, pgMatch(121917141));
  w.advance(1000);
  deq(times(0, 0), Array(9).fill(""), "the stock icons are reused: no old times");
  assert.ok(w.harness.logs.includes("[DPS] slots: 0 items, 108 empty, read in 0 ms, 0 frames"), "the new match's own icons read (no items in it)");
  deq(cells(0, 0), ["-", "-", "-", "-", "-", "-", "-", "LOCK", "LOCK"], "its own cells, nothing of the last match's");
  present(w, m);
  w.advance(30000);
  strips()[19].events.onmouseover();
  w.advance(3000);
  assert.equal(w.web.apiCalls.length, 1, "the same match again: the times from this session, not deadlock-api");
  strips()[19].events.onmouseout();

  // Too new for deadlock-api: said under FINAL ITEMS, asked again after a minute.
  const fresh = world(() => ({}));
  fresh.w.advance(30000);
  fresh.w.selectScreen("ScoreboardScreen");
  fresh.strips()[10].events.onmouseover();
  fresh.w.advance(3000);
  assert.equal(fresh.w.text("NSBuyNote"), "ITEM TIMES: THIS MATCH IS TOO NEW FOR DEADLOCK-API. TRY AGAIN LATER");
  assert.ok(fresh.w.boardHost().FindChildTraverse("NSBuyNote").classes.has("NSBuyNoteOn"));
  assert.ok(fresh.w.harness.logs.includes("[DPS] buys: no purchase history (deadlock-api does not have this match yet)"));
  fresh.strips()[10].events.onmouseout();
  fresh.strips()[11].events.onmouseover();
  fresh.w.advance(3000);
  assert.equal(fresh.w.web.apiCalls.length, 1, "not again within a minute");
  fresh.strips()[11].events.onmouseout();
  fresh.w.advance(60000);
  fresh.strips()[12].events.onmouseover();
  fresh.w.advance(3000);
  assert.equal(fresh.w.web.apiCalls.length, 2, "asked again after a minute");
  // No network: said too; one failed fetch is not tried again for each player.
  const down = world(() => ({}), { apiDown: true });
  down.w.advance(30000);
  down.w.selectScreen("ScoreboardScreen");
  down.strips()[10].events.onmouseover();
  down.w.advance(3000);
  assert.equal(down.w.text("NSBuyNote"), "ITEM TIMES: DEADLOCK-API NOT REACHED. TRY AGAIN LATER");
  assert.equal(down.w.web.apiCalls.length, 1);
});

check("board: HEALING is healing + barriers like Statlocker, not the stock number net of self-damage; its star follows", () => {
  // User 2026-11-23, match 137998268: the stock HEALING read 2,711 for Shiv (4,544 healed, 1,833 self-damage) under
  // a HEALING ONLY row of 4,544.
  const m = pgMatch(121917141);
  const shiv = m.teams[0][2];
  shiv.player_healing_healing = 9000;
  shiv.player_healing = shiv.player_healing_healing + shiv.player_healing_barriering - 8000; // the stock number
  const w = boardWorld();
  w.boot();
  present(w, m);
  w.advance(20000);
  const players = m.teams[0].concat(m.teams[1]);
  const heal = (p) => p.player_healing_healing + p.player_healing_barriering;
  const top = Math.max(...players.map(heal));
  players.forEach((p, k) => {
    const cell = findAll(w.columns()[k], "Panel").filter((c) => c.classes.has("NSCell"))[6];
    assert.equal(cell.children[0].__text, heal(p).toLocaleString("en-US"), `healing + barriers ${k}`);
    assert.equal(cell.classes.has("NSBest"), heal(p) === top, `the star on the most healing + barriers ${k}`);
  });
  assert.equal(heal(shiv), top, "the self-damage player heals the most");
});

check("board: a click on a row name turns that row through the stats of its kind (from the scoreboard and the graphs), on a hover too; a full turn gives the scoreboard back", () => {
  // User 2026-11-23: a GameBanana request for Statlocker's "Match Summary" views; then "based on the per level and
  // if it's suitable on that level" and no MORE menu ("it will be confusing").
  const { w, m, players, cols, cell, strips, duration } = timelineWorld();
  const host = w.boardHost();
  assert.ok(!host.FindChildTraverse("NSMore") && !host.FindChildTraverse("NSSections"), "no MORE menu");
  const rowLabels = () => host.FindChildTraverse("NSRowLabels").children;
  const labels = () => rowLabels().map((l) => l.__text);
  const show = (slot, name) => {
    for (let n = 0; n < 10 && labels()[slot] !== name; n++) rowLabels()[slot].events.onactivate();
    assert.equal(labels()[slot], name, `row ${slot}`);
  };
  const slots = (k) => findAll(cols[k], "Panel").filter((p) => p.classes.has("NSCell"));
  const text = (k, key) => cell(k, key).text;
  const star = (k, key) => cell(k, key).box.classes.has("NSBest");
  const fmt = (v) => Math.round(v).toLocaleString("en-US");
  const num = (s) => Number(String(s).replace(/,/g, ""));
  const team = (k) => (k < 6 ? 0 : 1);
  const teamKills = [0, 1].map((t) => m.teams[t].reduce((s, p) => s + p.player_kills, 0));
  const baseText = players.map((_, k) => slots(k).map((c) => c.children[0].__text));
  const baseStars = players.map((_, k) => slots(k).map((c) => c.classes.has("NSBest")));
  const bestOf = (key, value) => {
    const all = players.map(value);
    const top = Math.max(...all);
    players.forEach((_, k) => assert.equal(star(k, key), all[k] === top, `${key} star on the highest, player ${k}`));
  };

  // Each row turns through its own kind only and comes back to its scoreboard stat; a right click goes back.
  const BASE = ["TOTAL SOULS", "KILLS", "DEATHS", "ASSISTS", "PLAYER DAMAGE", "OBJECTIVE DAMAGE", "HEALING"];
  const KINDS = [
    ["SOULS / MIN"],
    ["KDA"],
    ["DAMAGE TAKEN", "TAKEN / LIFE"],
    ["KILL PARTICIPATION"],
    ["DAMAGE / MIN", "DAMAGE / LIFE", "BULLET DAMAGE", "HEADSHOT DAMAGE", "ABILITY DAMAGE", "MELEE DAMAGE"],
    ["OBJ. DAMAGE / MIN"],
    ["HEALING ONLY", "BARRIERS"]
  ];
  deq(labels(), BASE);
  KINDS.forEach((names, slot) => {
    const seen = names.concat([BASE[slot]]).map(() => (rowLabels()[slot].events.onactivate(), labels()[slot]));
    deq(seen, names.concat([BASE[slot]]), `row ${slot} turns through its kind`);
    rowLabels()[slot].events.oncontextmenu();
    assert.equal(labels()[slot], names[names.length - 1], `row ${slot}: a right click goes back`);
    rowLabels()[slot].events.onactivate();
  });
  deq(labels(), BASE);

  // Hovering a row name shows its kind as bars at the bottom middle of its border, the shown stat lit (user 2026-11-23).
  const pips = () => host.FindChildTraverse("NSRowPips");
  const lit = () => pips().children.filter((p) => p.classes.has("NSRowPipShown")).map((p) => (p.classes.has("NSRowPipOn") ? 1 : 0));
  rowLabels()[2].events.onmouseover();
  assert.ok(pips().classes.has("NSRowPipsOn") && pips().parent === host.FindChildTraverse("NSRowLabels"), "the bars show in the row-name column");
  deq(lit(), [1, 0, 0], "DEATHS: three stats, the first shown");
  assert.equal(pips().style.y, `${3 * 38 - 3}px`, "on row 3's bottom border");
  rowLabels()[2].events.onactivate();
  deq(lit(), [0, 1, 0], "a click moves the lit bar");
  rowLabels()[2].events.oncontextmenu();
  rowLabels()[4].events.onmouseover(); // straight onto another row: its out comes after the next row's over
  rowLabels()[2].events.onmouseout();
  deq(lit(), [1, 0, 0, 0, 0, 0, 0], "PLAYER DAMAGE: seven stats");
  assert.equal(pips().style.y, `${5 * 38 - 3}px`);
  rowLabels()[4].events.onmouseout();
  assert.ok(!pips().classes.has("NSRowPipsOn"), "gone when the mouse leaves");

  // The rates and shares.
  show(0, "SOULS / MIN"); show(1, "KDA"); show(3, "KILL PARTICIPATION"); show(4, "DAMAGE / MIN"); show(5, "OBJ. DAMAGE / MIN");
  assert.ok(players.every((_, k) => slots(k)[0].classes.has("NSSlot0") && !slots(k)[0].classes.has("NSCell_souls")), "row 1 keeps its slot class");
  players.forEach((p, k) => {
    assert.equal(text(k, "kda"), ((p.player_kills + p.player_assists) / Math.max(1, p.player_deaths)).toFixed(2), `KDA ${k}`);
    assert.equal(text(k, "kp"), `${(100 * (p.player_kills + p.player_assists) / teamKills[team(k)]).toFixed(1)}%`, `KP ${k}`);
    assert.equal(text(k, "dpm"), fmt(p.player_dmg / (duration / 60)), `damage / min ${k}`);
    assert.equal(text(k, "spm"), fmt(p.net_worth / (duration / 60)), `souls / min ${k}`);
    assert.equal(text(k, "odpm"), fmt(num(baseText[k][5]) / (duration / 60)), `objective damage / min ${k}`);
  });
  bestOf("dpm", (p) => p.player_dmg);

  // Per life and damage taken, at the end and at the half (the graphs' values then, read per player every column).
  show(2, "DAMAGE TAKEN"); show(4, "DAMAGE / LIFE");
  players.forEach((p, k) => {
    assert.equal(text(k, "dpl"), fmt(p.player_dmg / Math.max(1, p.player_deaths)), `damage / life ${k}`);
    assert.equal(text(k, "taken"), fmt(5000 + 2000 * p.player_deaths), `damage taken ${k}`); // the mock's Damage from Players
  });
  bestOf("taken", (p) => 5000 + 2000 * p.player_deaths);
  strips()[19].events.onmouseover();
  deq([labels()[2], labels()[4]], ["DAMAGE TAKEN", "DAMAGE / LIFE"], "both move over time");
  players.forEach((p, k) => {
    assert.equal(text(k, "taken"), fmt(Math.round((5000 + 2000 * p.player_deaths) * 0.5)), `damage taken at the half ${k}`);
    assert.ok(!cell(k, "taken").box.classes.has("NSCellFinal"));
    if ([3, 6, 7, 10].includes(k)) return; // twins' deaths may swap within the pair
    assert.equal(text(k, "dpl"), fmt(Math.round(p.player_dmg * 0.5) / Math.max(1, Math.round(p.player_deaths * 0.5))), `damage / life at the half ${k}`);
  });
  strips()[19].events.onmouseout();
  w.advance(200);
  show(2, "TAKEN / LIFE");
  players.forEach((p, k) => assert.equal(text(k, "tpl"), fmt((5000 + 2000 * p.player_deaths) / Math.max(1, p.player_deaths)), `taken / life ${k}`));

  // Damage types, one at a time in the player damage row.
  players.forEach((p, k) => {
    const d = p.player_dmg, gun = Math.round(d * 0.4), crit = Math.round(d * 0.1), melee = Math.round(d * 0.1);
    const want = { "BULLET DAMAGE": ["bullet", gun + crit], "HEADSHOT DAMAGE": ["crit", crit], "ABILITY DAMAGE": ["ability", d - gun - crit - melee], "MELEE DAMAGE": ["melee", melee] };
    for (const [name, [key, value]] of Object.entries(want)) {
      show(4, name);
      assert.equal(text(k, key), fmt(value), `${key} ${k}`);
    }
  });

  // Healing and barriers: no graph over time, so final and dimmed on a hover.
  show(6, "HEALING ONLY");
  players.forEach((p, k) => assert.equal(text(k, "healing"), fmt(p.player_healing_healing), `healing ${k}`));
  show(6, "BARRIERS");
  players.forEach((p, k) => assert.equal(text(k, "barrier"), p.player_healing_barriering ? fmt(p.player_healing_barriering) : "0", `barriers ${k}`));
  strips()[19].events.onmouseover();
  assert.equal(labels()[6], "BARRIERS (FINAL)", "no graph over time: final, dimmed");
  players.forEach((p, k) => assert.ok(cell(k, "barrier").box.classes.has("NSCellFinal"), `barriers dimmed ${k}`));
  strips()[19].events.onmouseout();
  w.advance(200);

  BASE.forEach((name, slot) => show(slot, name));
  players.forEach((_, k) => {
    deq(slots(k).map((c) => c.children[0].__text), baseText[k], `the scoreboard's own texts back ${k}`);
    deq(slots(k).map((c) => c.classes.has("NSBest")), baseStars[k], `the scoreboard's stars back ${k}`);
  });
  assert.ok(w.harness.logs.some((l) => l === "[DPS] row 7: barrier"), "a change is logged");
});

check("board: a click on a row name changes that row (right click: back); the rows come back after a restart from the save page", () => {
  // User 2026-11-23: change each row with a persistent save ("fine to use web").
  const disk = {};
  const world = (opts = {}) => {
    const w = boardWorld(Object.assign({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] }, disk }, opts));
    w.boot();
    present(w, pgMatch(121917141));
    w.advance(20000);
    return w;
  };
  const labels = (w) => w.boardHost().FindChildTraverse("NSRowLabels").children;
  const names = (w) => labels(w).map((l) => l.__text);
  const BASE = ["TOTAL SOULS", "KILLS", "DEATHS", "ASSISTS", "PLAYER DAMAGE", "OBJECTIVE DAMAGE", "HEALING"];
  // "CLICK A ROW NAME TO SWAP" until a row name was clicked, in this session or an earlier one (user 2026-11-23).
  const hint = (w) => w.boardHost().FindChildTraverse("NSRowHint").classes.has("NSRowHintOn");
  const a = world();
  assert.ok(a.harness.logs.includes("[DPS] prefs: nothing saved"), "first run: nothing saved yet");
  assert.ok(hint(a), "never clicked: the hint shows");
  deq(names(a), BASE);
  assert.ok(labels(a).every((l) => l.classes.has("NSCycle") && typeof l.events.onactivate === "function" && typeof l.events.oncontextmenu === "function"));
  labels(a)[0].events.onactivate();
  assert.equal(names(a)[0], "SOULS / MIN", "TOTAL SOULS -> SOULS / MIN");
  assert.ok(!hint(a), "one click: the hint goes");
  labels(a)[0].events.oncontextmenu();
  assert.equal(names(a)[0], "TOTAL SOULS", "right click: back");
  labels(a)[2].events.onactivate();
  labels(a)[2].events.onactivate();
  assert.equal(names(a)[2], "TAKEN / LIFE", "DEATHS -> DAMAGE TAKEN -> TAKEN / LIFE");
  labels(a)[1].events.onactivate();
  labels(a)[3].events.onactivate();
  const cells = (w, k) => findAll(w.columns()[k], "Panel").filter((p) => p.classes.has("NSCell")).map((c) => c.children[0].__text);
  const p0 = pgMatch(121917141).teams[0][0];
  assert.equal(cells(a, 0)[1], ((p0.player_kills + p0.player_assists) / Math.max(1, p0.player_deaths)).toFixed(2), "the row shows its new stat");
  a.advance(3000);
  assert.ok(a.harness.logs.includes("[DPS] prefs: saved"), "saved a second after the last change");
  deq(JSON.parse(a.web.disk["hantu.detailed_postgame.v1/prefs"]), { v: 1, rows: ["souls", "kda", "tpl", "kp", "pdmg", "odmg", "heal"], clicked: true });

  // A game restart: the same disk, a new board.
  const b = world();
  deq(names(b), ["TOTAL SOULS", "KDA", "TAKEN / LIFE", "KILL PARTICIPATION", "PLAYER DAMAGE", "OBJECTIVE DAMAGE", "HEALING"], "the saved rows came back");
  assert.ok(b.harness.logs.includes("[DPS] prefs: rows souls,kda,tpl,kp,pdmg,odmg,heal"));
  assert.ok(!hint(b), "clicked in an earlier session: no hint");
  disk["hantu.detailed_postgame.v1/prefs"] = JSON.stringify({ v: 1, rows: ["souls", "kills", "deaths", "assists", "pdmg", "odmg", "heal"], clicked: true });
  assert.ok(!hint(world()), "clicked, then turned back to the scoreboard's rows: still no hint");
  disk["hantu.detailed_postgame.v1/prefs"] = JSON.stringify({ v: 1, rows: ["souls", "kda", "deaths", "assists", "pdmg", "odmg", "heal"] });
  assert.ok(!hint(world()), "an older save (no clicked) with a changed row: no hint");
  disk["hantu.detailed_postgame.v1/prefs"] = JSON.stringify({ v: 1, rows: ["souls", "kills", "deaths", "assists", "pdmg", "odmg", "heal"] });
  assert.ok(hint(world()), "an older save of the scoreboard's rows: the hint");

  // An older save (the MORE menu's presets put any stat on any row): a stat of another kind shows the row's own.
  disk["hantu.detailed_postgame.v1/prefs"] = JSON.stringify({ v: 1, rows: ["spm", "kp", "taken", "", "dpm", "heal", ""] });
  const o = world();
  deq(names(o), ["SOULS / MIN", "KILLS", "DAMAGE TAKEN", "ASSISTS", "DAMAGE / MIN", "OBJECTIVE DAMAGE", "HEALING"], "each row keeps only a stat of its kind");

  // A record the page does not accept is never applied; no answer at all leaves the scoreboard's rows and the board working.
  disk["hantu.detailed_postgame.v1/prefs"] = JSON.stringify({ v: 1, rows: ["kda", "kda", "", "", "", "", ""] });
  const c = world();
  deq(names(c), BASE, "a bad record is ignored");
  assert.ok(c.harness.logs.includes("[DPS] prefs: nothing saved"));
  const d = world({ disk: {}, offline: true });
  deq(names(d), BASE);
  assert.ok(d.harness.logs.includes("[DPS] prefs: no answer from the save page"));
  assert.ok(hint(d), "no answer: the hint shows");
  assert.ok(d.harness.logs.some((l) => l.startsWith("[DPS] scan done")), "the board works without the page");
});

check("board: a row the graphs never give says \"-\" (Street Brawl whose player graphs gave nothing, a team with no kills), not a \"...\" that never ends", () => {
  // Review 2026-11-23.
  const KEY = "hantu.detailed_postgame.v1/prefs";
  const cellsOf = (w, k) => findAll(w.columns()[k], "Panel").filter((p) => p.classes.has("NSCell")).map((c) => c.children[0].__text);
  const m = pgMatch(136872372);
  m.minutes = 7;
  m.seconds = 26;
  m.teams = m.teams.map((t) => t.slice(0, 4));
  m.teams.forEach((t) => t.forEach((p) => { p.net_worth = 22400; }));
  m.teams[0].forEach((p) => { p.player_kills = 0; p.player_assists = 0; });
  const end = 4 * 22400;
  const disk = { [KEY]: JSON.stringify({ v: 1, rows: ["souls", "kills", "taken", "kp", "bullet", "odmg", "heal"] }) };
  const w = boardWorld({ disk, graph: { duration: 446, souls: [end, end], values: (f) => [Math.round(end * f) + Math.round(3000 * Math.sin(Math.PI * f)), Math.round(end * f)], lanes: [[[-1, -1], [-1, -1], [-1, -1]]] } });
  w.boot();
  w.fill(m);
  for (const t of [1, 2]) w.scoreboard.FindChildTraverse(`Team${t}`).FindChildTraverse("TeamPlayers").children.splice(4, 2);
  w.fire("CitadelMatchDetailsUpdated", m.id);
  w.advance(60000);
  assert.match(w.harness.logs.find((l) => l.startsWith("[DPS] timeline done")) || "", /dtype 0\/8, taken 0\/8/, "the per-player graphs gave nothing");
  // Street Brawl has its own slot rules (its lane objectives read as Walkers at 0:01 live): no extra-slot locks.
  assert.ok(!w.harness.logs.some((l) => l.includes("extra slots open")), "no locks in Street Brawl");
  for (let k = 0; k < 8; k++) {
    const cells = cellsOf(w, k);
    deq([cells[2], cells[4]], ["-", "-"], `damage taken and bullet damage ${k}`);
    if (k < 4) assert.equal(cells[3], "-", `kill participation of a team with no kills ${k}`);
    else assert.match(cells[3], /^\d+\.\d%$/, `the other team's kill participation ${k}`);
  }
  // Every player on the same souls: row 1 is dropped, so a hovered row's bars sit one row higher.
  const host = w.boardHost();
  assert.ok(host.FindChildTraverse("NSLabels").BHasClass("NSNoTotal"));
  const rowLabels = host.FindChildTraverse("NSRowLabels").children;
  rowLabels[1].events.onmouseover();
  assert.equal(host.FindChildTraverse("NSRowPips").style.y, `${38 - 3}px`, "KILLS is the first row shown: its bottom border");
  rowLabels[1].events.onmouseout();
  rowLabels[6].events.onmouseover();
  assert.equal(host.FindChildTraverse("NSRowPips").style.y, `${6 * 38 - 3}px`, "HEALING, the sixth row shown");
});

check("board: closing the page with the mouse on the lead graph brings the final numbers back; closing it while the graphs are read reads them again on the next show", () => {
  // Review 2026-11-23: no onmouseout arrives when the page closes; a scan on a hidden page reads nothing.
  const { w, strips } = timelineWorld();
  w.advance(30000);
  const souls = () => findAll(w.columns()[0], "Panel").filter((p) => p.classes.has("NSCell"))[0].children[0].__text;
  const final = { clock: w.text("NSClock"), souls: souls() };
  strips()[10].events.onmouseover();
  assert.notEqual(w.text("NSClock"), final.clock, "hovering shows the moment");
  w.page.RemoveClass("PageVisible");
  w.advance(10000);
  w.page.AddClass("PageVisible");
  w.advance(10000);
  deq({ clock: w.text("NSClock"), souls: souls() }, final, "the final board after reopening");
  assert.ok(!w.boardHost().FindChildTraverse("NSFrame").BHasClass("NSAtTime"));

  const m = pgMatch(121685912);
  const totals = m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  const v = boardWorld({ graph: { duration: m.minutes * 60 + m.seconds, souls: totals, timeline: true, sides: "button", lag: 1 } });
  // A frame takes 16 ms, as live (the mock runs $.Schedule(0) chains at once, so the page could never close mid-read).
  const schedule = v.harness.scheduler.schedule.bind(v.harness.scheduler);
  v.harness.scheduler.schedule = (delay, fn) => schedule(Math.max(Number(delay) || 0, 0.016), fn);
  v.boot();
  v.fill(m);
  v.fire("CitadelMatchDetailsUpdated", m.id);
  for (let t = 0; t < 60000 && !v.harness.logs.some((l) => /\[DPS\] timeline: \d+ steps/.test(l)); t += 50) v.advance(50);
  assert.ok(!v.harness.logs.some((l) => l.startsWith("[DPS] timeline done")), "closed during the timeline read");
  v.page.RemoveClass("PageVisible");
  v.advance(30000);
  assert.ok(v.harness.logs.includes("[DPS] scan: the page closed before the graphs were read; read again on the next show"));
  v.page.AddClass("PageVisible");
  v.advance(60000);
  const done = v.harness.logs.filter((l) => l.startsWith("[DPS] timeline done"));
  assert.equal(done.length, 1, "one timeline, after reopening");
  assert.equal(v.harness.logs.filter((l) => /^\[DPS\] timeline: \d+ steps/.test(l)).length, 2, "the cut read, and a whole one after reopening");
  assert.match(done[0], / 0 failed: souls 12\/12, kills 12\/12, deaths 12\/12, pdmg 12\/12/);
});

check("board: HEALING (NO BARRIER) only over the Healing graph's values; unread, the hover says the numbers are final", () => {
  // Review 2026-11-23: the caption showed over the final numbers, barrier included, when that graph was not read.
  const { w, strips } = timelineWorld({ timeline: (p, f, key) => Math.round(p[{ souls: "net_worth", kills: "player_kills", deaths: "player_deaths", pdmg: "player_dmg", odmg: "obj_dmg", heal: "player_deaths" }[key]] * f) });
  w.advance(30000);
  assert.match(w.harness.logs.find((l) => l.startsWith("[DPS] timeline done")), /heal 0\/12/, "the Healing graph was not read");
  const label = () => w.boardHost().FindChildTraverse("NSRowLabels").children[6].__text;
  strips()[10].events.onmouseover();
  assert.equal(label(), "HEALING (FINAL)");
  strips()[10].events.onmouseout();
  strips()[39].events.onmouseover();
  assert.equal(label(), "HEALING", "the last column: the final numbers");
  strips()[39].events.onmouseout();
  w.advance(200);
  const good = timelineWorld();
  good.strips()[10].events.onmouseover();
  assert.equal(good.w.boardHost().FindChildTraverse("NSRowLabels").children[6].__text, "HEALING (NO BARRIER)", "read: the graph's own");
});

check("board: a row clicked before the save page answers keeps its change and the other rows still come back; a page that never answered is asked again and is never written over before it does", () => {
  // Review 2026-11-23: one click before the answer replaced all seven saved rows; one slow first load lost them for
  // the session and the next click saved the scoreboard's stats over them.
  const KEY = "hantu.detailed_postgame.v1/prefs";
  const saved = ["spm", "kda", "tpl", "kp", "dpm", "odpm", "healing"];
  const names = (w) => w.boardHost().FindChildTraverse("NSRowLabels").children.map((l) => l.__text);
  const said = (w) => w.harness.logs.filter((l) => l.startsWith("[DPS] prefs:"));

  const disk = { [KEY]: JSON.stringify({ v: 1, rows: saved }) };
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] }, disk });
  w.boot();
  const m = pgMatch(121917141);
  w.fill(m);
  w.fire("CitadelMatchDetailsUpdated", m.id);
  for (let t = 0; t < 3000 && !w.harness.logs.some((l) => l.startsWith("[DPS] board shown")); t += 5) w.advance(5);
  assert.deepEqual(said(w), [], "shown before the answer");
  assert.ok(!w.boardHost().FindChildTraverse("NSRowHint").classes.has("NSRowHintOn"), "no hint before the answer (it would flash for a player who knows)");
  w.boardHost().FindChildTraverse("NSRowLabels").children[3].events.onactivate(); // ASSISTS -> KILL PARTICIPATION
  w.advance(20000);
  deq(names(w), ["SOULS / MIN", "KDA", "TAKEN / LIFE", "KILL PARTICIPATION", "DAMAGE / MIN", "OBJ. DAMAGE / MIN", "HEALING ONLY"], "the saved rows, and the click");
  assert.ok(said(w).includes("[DPS] prefs: rows spm,kda,tpl,kp,dpm,odpm,healing (row 4 changed meanwhile: kept)"), said(w).join(" / "));
  deq(JSON.parse(disk[KEY]).rows, saved, "saved as shown");

  const disk2 = { [KEY]: JSON.stringify({ v: 1, rows: saved }) };
  const v = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] }, disk: disk2, offline: true });
  v.boot();
  present(v, pgMatch(121917141));
  v.advance(20000);
  assert.ok(said(v).includes("[DPS] prefs: no answer from the save page"));
  v.boardHost().FindChildTraverse("NSRowLabels").children[0].events.onactivate(); // TOTAL SOULS -> SOULS / MIN, page still down
  v.advance(20000);
  deq(JSON.parse(disk2[KEY]).rows, saved, "nothing written while the page never answered");
  v.web.offline = false;
  present(v, pgMatch(121917142));
  v.advance(30000);
  deq(names(v), ["SOULS / MIN", "KDA", "TAKEN / LIFE", "KILL PARTICIPATION", "DAMAGE / MIN", "OBJ. DAMAGE / MIN", "HEALING ONLY"], "asked again on the next board: the saved rows");
  deq(JSON.parse(disk2[KEY]).rows, saved, "row 1's click and the saved row agree");
});

check("copy: a click on the header match id copies it the stock way, says so, and comes back; a failing stock route falls back to a selected TextEntry", () => {
  // How it could fail: the label takes no click (hittest off, or an ancestor blocks children); the stock event
  // does not reach the page; the feedback
  // stays, or an old timer overwrites a newer match; a throwing route leaves nothing copied or claims success.
  const board = read("panorama/layout/detailed_postgame/pg_board.xml");
  assert.match(board, /<Label id="NSMatch"[^>]*hittest="true"[^>]*onmouseover="UIShowTextTooltip\( #Citadel_PostGame_CopyMatchID \)"[^>]*onmouseout="UIHideTextTooltip\(\)"/);
  assert.ok(!/hittestchildren="false"/.test(board), "no ancestor blocks the label");
  assert.match(board, /<TextEntry id="NSCopyEntry" class="NSCopyEntry" hittest="false"/);
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] } });
  w.boot();
  const a = pgMatch(121685912);
  present(w, a);
  w.advance(20000);
  const label = w.boardHost().FindChildTraverse("NSMatch");
  assert.equal(w.text("NSMatch"), "MATCH 121685912");
  assert.equal(typeof label.events.onactivate, "function", "the label has a click handler");
  label.events.onactivate();
  // The page callback copies the page's match id; the source only anchors the stock feedback (0x181b2bcb0).
  deq(w.copy.stock.map((p) => p === label), [true], "CitadelPostGameCopyMatchID from #NSMatch");
  deq(w.copy.entry, [], "no fallback needed");
  assert.equal(w.text("NSMatch"), "MATCH ID COPIED");
  assert.ok(label.BHasClass("NSCopied"));
  w.advance(1000);
  label.events.onactivate(); // a second click restarts the feedback
  w.advance(1000);
  assert.equal(w.text("NSMatch"), "MATCH ID COPIED", "the first click's timer does not end the second's");
  w.advance(1000);
  assert.equal(w.text("NSMatch"), "MATCH 121685912");
  assert.ok(!label.BHasClass("NSCopied"));
  // The next match on the reused rows while "copied" shows: its own id, no stale restore.
  label.events.onactivate();
  const b = pgMatch(121917141, { swap: true, win: 2 });
  present(w, b);
  w.advance(3000);
  assert.equal(w.text("NSMatch"), "MATCH 121917141");
  assert.ok(!label.BHasClass("NSCopied"));
  // A throwing stock route: the id goes through the selected TextEntry instead.
  w.copy.stockThrows = true;
  label.events.onactivate();
  deq(w.copy.entry, [{ text: "121917141", selected: true, focused: true }], "fallback copies the bare id");
  assert.equal(w.text("NSMatch"), "MATCH ID COPIED");
  assert.ok(w.harness.logs.some((l) => l === "[DPS] match id copied (entry)"));
  assert.ok(noBoardErrors(w));
});

check("board: objective owners follow the page's own left team (viewer-relative, seen 2026-11-13 on 6861); no side information drops the lanes", () => {
  // How it could fail: the left label is taken for team 1 again (every owner mirrored when team 2 is on the left),
  // or sides are guessed when neither the lane heroes nor the picked button say which team is on the left.
  const run = (extra) => {
    const a = pgMatch(121685912);
    const souls = a.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
    const graph = Object.assign({ duration: a.minutes * 60 + a.seconds, souls, lanes: [[[478, 700], [-1, -1], [-1, -1]]] }, extra);
    const w = boardWorld({ graph });
    w.boot();
    w.fill(a);
    w.fire("CitadelMatchDetailsUpdated", a.id);
    w.advance(30000);
    const tag = "[DPS] data events + ";
    const events = w.harness.logs.filter((l) => l.startsWith(tag)).map((l) => JSON.parse(l.slice(tag.length)));
    return { events, logs: w.harness.logs.filter((l) => l.startsWith("[DPS] scan: lane ")) };
  };
  // The mock lane says team 1's structure falls at 478 and team 2's at 700, whichever side the page shows team 1 on.
  const right = [{ t: 478, tier: "Tier 1", owner: 1, killer: 2 }, { t: 700, tier: "Tier 1", owner: 2, killer: 1 }];
  // The mock repeats one lane for every pick, so each event comes once per lane read.
  const same = (events) => assert.deepEqual([...new Set(events.map((e) => `${e.t}:${e.owner}:${e.killer}`))], right.map((e) => `${e.t}:${e.owner}:${e.killer}`));
  const t1 = run({ left: 1 });
  same(t1.events);
  assert.match(t1.logs[0], /left team 1 by lane heroes, left heroes \d+,\d+$/, t1.logs.join("|"));
  const t2 = run({ left: 2 });
  same(t2.events);
  assert.match(t2.logs[0], /left team 2 by lane heroes, left heroes \d+,\d+$/, t2.logs.join("|"));
  const b2 = run({ left: 2, sides: "button" });
  same(b2.events);
  assert.match(b2.logs[0], /left team 2 by picked button, left heroes (\d+,){5}\d+$/, b2.logs.join("|"));
  same(run({ left: 1, sides: "button" }).events);
  const none = run({ left: 2, sides: "none" });
  assert.equal(none.events.length, 0, "no side information: no objectives drawn");
  assert.match(none.logs[0], /left team unknown, objectives dropped: none \(/, none.logs.join("|"));
});

check("board: the item count is taken again when icons arrive after the build, once per change, with the per-column counts", () => {
  // How it could fail: fitGraph counts at build time only, so icons the stock rows get later never push the graph;
  // or it runs on every safety check and floods the log.
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] } });
  w.boot();
  const first = () => w.scoreboard.FindChildTraverse("Team1").FindChildTraverse("TeamPlayers").children[0].FindChildTraverse("ItemsContainer");
  const margin = () => String(w.boardHost().FindChildTraverse("NSGraph").style.marginTop);
  const fits = () => w.harness.logs.filter((l) => l.startsWith("[DPS] items: "));
  present(w, pgMatch(121685912));
  w.advance(5000);
  assert.equal(margin(), "8px");
  const n = fits().length;
  assert.match(fits()[n - 1], /^\[DPS\] items: 9 max, 3 rows, graph pushed 0px, per column (\d+,){11}\d+$/, fits()[n - 1]);
  w.advance(5000);
  assert.equal(fits().length, n, "an unchanged count logs nothing more");
  for (let i = 0; i < 6; i++) new MockPanel("CitadelModIcon", first(), ""); // 15 items: 5 rows, no new match
  w.advance(15000); // one column per check
  assert.equal(margin(), "24px", "the late icons pushed the graph");
  assert.equal(fits().length, n + 1, "one line for the change");
  assert.match(fits()[n], /items: 15 max, 5 rows, graph pushed 16px, per column 15,/, fits()[n]);
  w.advance(5000);
  assert.equal(fits().length, n + 1, "and no more until it changes again");
});

check("board: more than 12 final items push the lead graph down (capped), and teardown resets it; stock match id labels lose hit testing and get it back", () => {
  // How it could fail: a 5th or 6th item row runs into the graph; the push stays after a smaller match; the hidden
  // stock #MatchID still takes hover (tooltip over empty space) or is never restored; the header copy needs it.
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] } });
  w.boot();
  const graph = () => w.boardHost().FindChildTraverse("NSGraph");
  const stock = () => w.page.FindChildTraverse("ScoreboardScreen").Children().filter((k) => k.id === "MatchID" || k.BHasClass("MatchMode"));
  const items = () => w.scoreboard.FindChildTraverse("Team1").FindChildTraverse("TeamPlayers").children[0].FindChildTraverse("ItemsContainer");
  const margin = () => String(graph().style.marginTop);
  present(w, pgMatch(121685912));
  w.advance(20000);
  assert.equal(margin(), "8px", "9 items (3 rows): the graph keeps its 8 px margin");
  const labels = stock();
  assert.ok(labels.length > 0, "the stock page has match id labels to hide");
  const hits = labels.map(() => []);
  labels.forEach((k, i) => {
    let value = k.hittest;
    Object.defineProperty(k, "hittest", { get: () => value, set: (v) => { value = v; hits[i].push(v); }, configurable: true });
  });
  for (let i = 0; i < 3; i++) new MockPanel("CitadelModIcon", items(), ""); // 12 items: 4 rows still fit
  present(w, pgMatch(121917141, { swap: true, win: 2 }));
  w.advance(3000);
  assert.equal(margin(), "8px", "12 items (4 rows) fit above the graph");
  for (let i = 0; i < 3; i++) new MockPanel("CitadelModIcon", items(), ""); // 15 items: 5 rows
  present(w, pgMatch(121685912));
  w.advance(3000);
  assert.equal(margin(), "24px", "15 items (5 rows): 8 px + 16 px");
  for (let i = 0; i < 3; i++) new MockPanel("CitadelModIcon", items(), ""); // 18 items: 6 rows
  present(w, pgMatch(121917141, { swap: true, win: 2 }));
  w.advance(3000);
  assert.equal(margin(), "34px", "18 items (6 rows): 8 px + the 26 px cap");
  labels.forEach((k, i) => {
    assert.equal(String(k.style.opacity), "0", "a stock label is invisible");
    assert.equal(k.hittest, false, "and takes no hover or click");
    assert.ok(hits[i].includes(true) && hits[i][hits[i].length - 1] === false, "teardown gave hit testing back before show() took it again");
  });
  const label = w.boardHost().FindChildTraverse("NSMatch");
  label.events.onactivate();
  deq(w.copy.stock.map((p) => p === label), [true], "the header copy does not depend on the stock label");
  const js = read("panorama/scripts/detailed_postgame/pg_board.js");
  assert.match(js, /function stockRestore\(\)[^]*?opacity: "1"[^]*?stockHit\(panel, true\)/, "teardown restores opacity and hit testing");
  assert.ok(/S\.cols = \[\];\s*stockRestore\(\);/.test(js) && /marginTop: `\$\{GRAPH_GAP_PX\}px`/.test(js), "teardown restores the labels and the graph margin");
  assert.ok(noBoardErrors(w));
});

check("board: a screen narrower than 1648 px sets one ui-scale on the frame and the stock scoreboard (never a transform); 16:9, 16:10 and 21:9 write nothing; width 0 retries; teardown resets", () => {
  // How it could fail: a wide screen gets a ui-scale or a transform (the board moves); the transform approach comes back (it clips at the page width); 4:3 or 5:4 scales only one of the two subtrees
  // (rows and header drift apart); the factor is read before the layout exists and sticks; a resize is never seen;
  // the scale outlives teardown; a rebuild (next match) drops the ui-scale; the log line repeats on every 1 s check.
  const fits = (w) => w.harness.logs.filter((l) => /fit: width/.test(l));
  const subjects = (w) => [w.boardHost().FindChildTraverse("NSFrame"), w.scoreboard];
  const size = (w, virtual, uiScale = 1) => Object.assign(w.boardHost(), { actuallayoutwidth: virtual * uiScale, actualuiscale_x: uiScale });
  const noTransform = (p) => ["preTransformScale2d", "transformOrigin"].forEach((k) => assert.equal(p.style[k], undefined, `no ${k} on ${p.id || p.type}`));
  const untouched = (w) => subjects(w).forEach((p) => {
    assert.ok([undefined, "", "100%"].includes(p.style.uiScale), `no ui-scale on ${p.id || p.type}: ${p.style.uiScale}`);
    noTransform(p);
  });
  for (const width of [1920, 1728, 2560]) {
    const w = boardWorld();
    w.boot();
    size(w, width, 1);
    present(w, pgMatch(121685912));
    w.advance(5000);
    assert.equal(w.shown(), 1, "built");
    untouched(w);
    assert.equal(String(w.scoreboard.style.marginTop), "129px", `${width}: the rows stay where they were`);
    assert.equal(fits(w).length, 0, `${width}: no fit line`);
  }
  for (const [width, factor, top, uiScale] of [[1440, "0.873", "115.41px", 1], [1350, "0.819", "109.63px", 1], [1440, "0.873", "115.41px", 2]]) {
    const w = boardWorld();
    w.boot();
    size(w, width, uiScale);
    present(w, pgMatch(121685912));
    w.advance(5000);
    const pct = `${(Number(factor) * 100).toFixed(1)}%`;
    subjects(w).forEach((p) => {
      assert.equal(p.style.uiScale, pct, `${width}: one ui-scale on ${p.id || p.type}`);
      noTransform(p);
    });
    assert.equal(String(w.scoreboard.style.marginTop), top, `${width}: the scoreboard starts where the scaled frame's rows start`);
    deq(fits(w).map((l) => l.replace(/^\[\w+\] /, "")), [`fit: width ${width}, scale ${factor}`], "one line, not one per check");
    w.advance(5000);
    assert.equal(fits(w).length, 1, "an unchanged factor logs and writes nothing again");
    // The next match rebuilds the board: layoutScoreboard and the teardown reset must not leave 100% behind.
    present(w, pgMatch(121685913));
    w.advance(5000);
    subjects(w).forEach((p) => {
      assert.equal(p.style.uiScale, pct, `${width}: a rebuild keeps the ui-scale on ${p.id || p.type}`);
      noTransform(p);
    });
    assert.equal(String(w.scoreboard.style.marginTop), top, `${width}: a rebuild keeps the margin`);
    assert.equal(fits(w).length, 1, "a rebuild logs no second line");
  }
  const w = boardWorld();
  w.boot();
  size(w, 0, 1);
  present(w, pgMatch(121685912));
  w.advance(5000);
  untouched(w);
  assert.equal(fits(w).length, 0, "width 0 writes nothing");
  size(w, 1440, 1);
  w.advance(1100);
  subjects(w).forEach((p) => assert.equal(p.style.uiScale, "87.3%", "the 1 s check retried"));
  size(w, 1920, 1);
  w.advance(1100);
  untouched(w);
  assert.equal(String(w.scoreboard.style.marginTop), "129px", "a resize back to 16:9 restores the margin");
  size(w, 1350, 1);
  w.advance(1100);
  subjects(w).forEach((p) => assert.equal(p.style.uiScale, "81.9%", "a resize is seen"));
  assert.equal(fits(w).length, 3, "one line per change");
  w.boardHost().NSStop();
  untouched(w);
  assert.equal(String(w.scoreboard.style.marginTop), "129px", "teardown resets the margin");
  const js = read("panorama/scripts/detailed_postgame/pg_board.js");
  assert.ok(/S\.fitScale = 1;\s*fitWrite\(1\);/.test(js), "teardown resets the factor");
  assert.ok(noBoardErrors(w));
});

check("standalone: only its own detailed_postgame files, every include resolves, the page is the pinned stock page plus the loader", () => {
  // How it could fail: a path still points at observer_hud/ (pak10's files would load, or nothing); an
  // include names a file the pak does not ship; the page drifts from stock when Valve changes it.
  const expected = ["layout/post_game/citadel_db_page_post_game_new.xml", "layout/detailed_postgame/pg_board.xml", "layout/detailed_postgame/pg_column.xml",
    "scripts/detailed_postgame/pg_board.js", "scripts/detailed_postgame/pg_loader.js", "styles/detailed_postgame/pg_board.css"]
    .concat(["torn_award", "torn_graph", "torn_head_l", "torn_head_r", "torn_track"].flatMap((n) => [`images/detailed_postgame/${n}.png`, `images/detailed_postgame/${n}.vtex`]));
  deq(SHIPPED, expected.sort(), "the source tree is exactly the board");
  const compiled = { vjs_c: "js", vcss_c: "css", vxml_c: "xml", vtex: "vtex" };
  for (const rel of SHIPPED.filter((f) => !f.endsWith(".png"))) {
    const text = read(`panorama/${rel}`);
    assert.ok(!/(?:s2r:\/\/|file:\/\/\{resources\}\/)[^"]*observer_hud|OHState/.test(text), `${rel} loads no Observer HUD file`);
    for (const [, file, ext] of text.matchAll(/s2r:\/\/panorama\/([\w/]+)\.(vjs_c|vcss_c|vxml_c|vtex)/g)) {
      if (!file.includes("detailed_postgame/")) continue; // a stock asset (masks, textures)
      assert.ok(SHIPPED.includes(`${file}.${compiled[ext]}`), `${rel}: ${file}.${ext} is shipped`);
    }
    for (const [, file] of text.matchAll(/file:\/\/\{resources\}\/(layout\/detailed_postgame\/[\w/]+\.xml)/g)) assert.ok(SHIPPED.includes(file), `${rel}: ${file} is shipped`);
  }
  for (const rel of SHIPPED.filter((f) => f.endsWith(".vtex"))) assert.ok(read(`panorama/${rel}`).includes(`"panorama/${rel.replace(/\.vtex$/, ".png")}"`), `${rel} reads its own png`);
  // The page: the stock page pinned by Observer HUD (the same GameTracking pin) plus our include, minus the flame src.
  const pin = JSON.parse(fs.readFileSync(path.join(REPO, "observer_hud", "stock-pin.json"), "utf8"));
  const flame = ' src="file://{resources}/videos/pick_screen/play_btn_grn_flame.webm"';
  const page = read("panorama/layout/post_game/citadel_db_page_post_game_new.xml");
  assert.ok(!page.includes(flame), "flame src dropped");
  assert.equal(page.split("detailed_postgame/pg_loader.vjs_c").length, 2, "one loader include");
  const restored = page.replace('\t\t<include src="s2r://panorama/scripts/detailed_postgame/pg_loader.vjs_c" />\n', "")
    .replace('<MoviePanel id="PlayButtonFX" class="btn_fx"', `<MoviePanel id="PlayButtonFX" class="btn_fx"${flame}`);
  assert.equal(crypto.createHash("sha256").update(restored).digest("hex"),
    pin.files["game/citadel/pak01_dir/panorama/layout/post_game/citadel_db_page_post_game_new.xml"], "post-game page = stock + loader - flame src");
  assert.match(read("panorama/scripts/detailed_postgame/pg_loader.js"), /play_btn_grn_flame\.webm/);
});

check("standalone: the credit strip (donate link) sits under the page nav, shows with the board, only DONATE is hittable, a click opens Ko-fi, teardown hides it", () => {
  // How it could fail: the strip is missing or shows another version text; it or its text covers the stock nav, ESC BACK or
  // the replay buttons (a hittable ancestor or label); DONATE opens the wrong page or another event; the strip shows on
  // another post-game screen or after teardown; it sits inside the scaled frame; it leaked into observer_hud.
  const board = read("panorama/layout/detailed_postgame/pg_board.xml");
  const js = read("panorama/scripts/detailed_postgame/pg_board.js");
  const css = read("panorama/styles/detailed_postgame/pg_board.css");
  assert.match(js, /const MOD_VERSION = "3";/);
  assert.match(js, /const CREDIT_TEXT = `DETAILED POSTGAME V\$\{MOD_VERSION\} BY HANTURAYA`;/);
  const strip = board.match(/<Panel id="NSCredit"[\s\S]*?\n\t\t<\/Panel>/);
  assert.ok(strip, "strip in the layout");
  assert.ok(board.indexOf('id="NSCredit"') < board.indexOf('id="NSFrame"') && !/<Panel id="NSFrame"[\s\S]*id="NSCredit"/.test(board), "sibling of the frame, outside the ui-scale");
  const hit = [...strip[0].matchAll(/<(?:Panel|Label)\b[^>]*>/g)].map((m) => [m[0].match(/id="([^"]+)"|class="([^"]+)"/), /hittest="true"/.test(m[0]), /hittest="false"/.test(m[0])]);
  assert.equal(hit.filter((h) => h[1]).length, 1, "exactly one hittable element");
  assert.ok(/id="NSCreditDonate"[^>]*hittest="true"/.test(strip[0]));
  assert.ok(hit.filter((h) => !h[1]).every((h) => h[2]), "everything else says hittest=false");
  assert.match(css, /\.NSCredit\s*\{[^}]*horizontal-align: center;[^}]*vertical-align: bottom;/);
  assert.match(css, /\.NSCredit\s*\{[^}]*height: 18px;[^}]*margin-bottom: 4px;/);
  assert.match(css, /\.NSCreditDonate:hover\s*\{\s*color: #FBDCA0;/);
  assert.match(js + css + board, /STANDALONE ONLY/);
  for (const [name, text] of [["pg_board.js", js], ["pg_board.css", css], ["pg_board.xml", board]]) assert.match(text, /STANDALONE ONLY|standalone-only|standalone only/i, `${name} marks the block`);
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] } });
  w.boot();
  const host = w.boardHost();
  const credit = host.FindChildTraverse("NSCredit");
  const donate = host.FindChildTraverse("NSCreditDonate");
  assert.equal(w.text("NSCreditText"), "DETAILED POSTGAME V3 BY HANTURAYA");
  assert.ok(!credit.BHasClass("NSOn") && !credit.BHasClass("NSIntro"), "hidden before the board shows");
  present(w, pgMatch(121685912));
  w.advance(20000);
  assert.equal(w.shown(), 1, "board built");
  assert.ok(credit.BHasClass("NSOn"), "laid out with the board");
  assert.equal(credit.BHasClass("NSIntro"), host.FindChildTraverse("NSFrame").BHasClass("NSIntro"), "the strip follows the frame's entrance");
  w.selectScreen("ScoreboardScreen");
  w.advance(3000);
  assert.ok(credit.BHasClass("NSOn") && credit.BHasClass("NSIntro"), "on the Scoreboard screen: shown, in the same intro as the frame");
  assert.ok(host.FindChildTraverse("NSFrame").BHasClass("NSIntro"));
  assert.equal(typeof donate.events.onactivate, "function", "DONATE takes the click");
  assert.equal(w.text("NSCreditText"), "DETAILED POSTGAME V3 BY HANTURAYA");
  donate.events.onactivate();
  deq(w.copy.urls, ["https://ko-fi.com/hantuaraya"], "one ExternalBrowserGoToURL with the Ko-fi page");
  // another post-game screen: the frame loses NSIntro and so does the strip (DONATE collapses with it, so it takes no click)
  w.selectScreen("GraphsScreen");
  w.advance(5000);
  assert.ok(!host.FindChildTraverse("NSFrame").BHasClass("NSIntro"), "frame hidden off the Scoreboard screen");
  assert.ok(!credit.BHasClass("NSIntro"), "strip hidden off the Scoreboard screen");
  w.selectScreen("ScoreboardScreen");
  w.advance(3000);
  assert.ok(credit.BHasClass("NSIntro"), "back on the Scoreboard screen");
  host.NSStop();
  assert.ok(!credit.BHasClass("NSOn") && !credit.BHasClass("NSIntro"), "hidden after teardown");
  assert.ok(noBoardErrors(w));
  // the observer fork is untouched
  for (const f of ["observer_hud/panorama/scripts/observer_hud/pg_board.js", "observer_hud/panorama/layout/observer_hud/pg_board.xml", "observer_hud/panorama/styles/observer_hud/pg_board.css"]) {
    const t = fs.readFileSync(path.join(REPO, f), "utf8");
    assert.ok(!/NSCredit|ko-fi|HANTURAYA/i.test(t), `${f}: no credit strip`);
  }
});

check("standalone: no observer extras - no web page, no handoff listener, stock team names, no organiser or alias", () => {
  // How it could fail: a leftover store call loads a hosted page for every match; a leftover handoff
  // listener lets another mod's OHM1 message rename the teams; the header or graph shows a card's names.
  for (const name of ["pg_board.js", "pg_loader.js"]) {
    // the standalone credit strip's Ko-fi constant and the row layout's save page are the only URLs
    const js = script(name).replace(/^.*const DONATE_URL = .*$/m, "").replace(/^.*const PREFS_URL = .*$/m, "");
    for (const bad of [/https?:\/\//, /ClientUI_FireOutput/, /\$\.OHState/, /\bOH\./]) assert.ok(!bad.test(js), `${name}: no ${bad}`);
  }
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] } });
  w.boot();
  const m = pgMatch(121917141);
  present(w, m);
  w.advance(20000);
  assert.equal(w.shown(), 1, "the board is shown");
  deq(w.bus.map((e) => e.name), ["CitadelMatchDetailsUpdated"], "one listener: the match event");
  w.fire("ClientUI_FireOutput", `OHM1:${JSON.stringify({ a: m.teams[0].map((p) => Number(p.account)), b: m.teams[1].map((p) => Number(p.account)), t: [["Night Owls", "NOW", "https://img.test/o.png"], ["Brass Saints", "BRS", ""]], r: ["Community Cup", ""], w: 1, id: "", at: 7000 })}`);
  w.advance(2000);
  deq([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Hidden King", "Archmother"], "stock team names");
  // One web panel: the row layout's save page (user 2026-11-23), nothing else is loaded.
  assert.equal(findAll(w.dash, "CitadelHTMLPanel").length, 1, "one web panel");
  assert.ok(w.web.urls.length > 0 && w.web.urls.every((url) => url === "about:blank" || url.startsWith(PREFS_URL)), "only the save page");
  assert.equal(findAll(w.dash, "Image").filter((p) => p.id !== "NSSlotLock").length, 0, "no logo image (the item slots' lock is the stock one)");
  assert.ok(!w.boardHost().FindChildTraverse("NSOrgText") && !w.boardHost().FindChildTraverse("NSAlias"), "no organiser or alias labels");
  // Steam names from our own CitadelUserName on each plate.
  const plates = w.columns().map((c) => c.FindChildTraverse("NSPlate"));
  assert.equal(plates.length, 12);
  for (const plate of plates) assert.ok(findAll(plate, "CitadelUserName").length === 1, "one name per plate");
  assert.ok(!w.harness.logs.some((l) => /store|alias|card/i.test(l)), "no store, alias or card lines");
  assert.ok(w.harness.logs.some((l) => l.startsWith("[DPS] scan done")), "the scan finished");
  assert.ok(noBoardErrors(w));
});


const out = path.join(REPO, ".tmp", "detailed-postgame-validate.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`${results.checks.length} checks passed; artifact ${path.relative(REPO, out)}`);