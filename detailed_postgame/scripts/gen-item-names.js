#!/usr/bin/env node
// Writes the item class names into the hpv2-store save page (dps/v1/index.html, between the ITEM-NAMES markers).
// The page turns deadlock-api's purchase item ids back into class names with them: an item id is the MurmurHash2
// (seed 0x31415926) of its class name. The board then shows each item's name with $.Localize("#" + class).
// Source: the game's citadel_gc_mod_names English file, every "upgrade_*" key (not the *_search aliases).
// Run after a game patch adds items:
//   node detailed_postgame/scripts/gen-item-names.js [--game <citadel dir>] [--page <index.html>] [--check <metadata.json>...]
"use strict";
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const game = opt("--game", "F:/SteamLibrary/steamapps/common/Deadlock/game/citadel");
const page = opt("--page", "D:/hpv2-store/dps/v1/index.html");
const checks = args.filter((a, i) => args[i - 1] === "--check");

function murmur2(str, seed) {
  const data = Buffer.from(str, "utf8");
  const m = 0x5bd1e995;
  let h = (seed ^ data.length) >>> 0;
  let i = 0;
  let len = data.length;
  while (len >= 4) {
    let k = data.readUInt32LE(i);
    k = Math.imul(k, m);
    k ^= k >>> 24;
    k = Math.imul(k, m);
    h = Math.imul(h, m) ^ k;
    i += 4;
    len -= 4;
  }
  if (len === 3) h ^= data[i + 2] << 16;
  if (len >= 2) h ^= data[i + 1] << 8;
  if (len >= 1) { h ^= data[i]; h = Math.imul(h, m); }
  h ^= h >>> 13;
  h = Math.imul(h, m);
  h ^= h >>> 15;
  return h >>> 0;
}

const file = path.join(game, "resource/localization/citadel_gc_mod_names/citadel_gc_mod_names_english.txt");
const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const names = [...new Set([...text.matchAll(/"(upgrade_[a-z0-9_]+)"\s+"([^"]*)"/g)].map((m) => m[1]).filter((k) => !k.endsWith("_search")))].sort();
const ids = new Map(names.map((n) => [murmur2(n, 0x31415926), n]));
if (ids.size !== names.length) throw new Error("two item names share an id");
console.log(`${names.length} item names from ${path.basename(file)}`);

// --check: every purchase of these matches that is still owned at the end must be named (the rest are ability
// points: their ids are not items).
for (const metaFile of checks) {
  const players = JSON.parse(fs.readFileSync(metaFile, "utf8")).match_info.players;
  let owned = 0;
  let named = 0;
  for (const p of players) {
    for (const it of p.items) {
      if (!ids.has(it.item_id)) continue;
      named++;
      if (!it.sold_time_s) owned++;
    }
  }
  console.log(`${path.basename(metaFile)}: ${named} purchases named, ${owned} still owned at the end (${players.length} players)`);
}

const START = "// ITEM-NAMES:START (detailed_postgame/scripts/gen-item-names.js)";
const END = "// ITEM-NAMES:END";
const html = fs.readFileSync(page, "utf8");
const a = html.indexOf(START);
const b = html.indexOf(END);
if (a < 0 || b < a) throw new Error(`no ITEM-NAMES markers in ${page}`);
const lines = [];
let line = "  var ITEM_NAMES = [";
for (const n of names) {
  const part = `"${n}",`;
  if (line.length + part.length > 118) { lines.push(line); line = "    "; }
  line += part;
}
lines.push(line.replace(/,$/, "") + "];");
const next = html.slice(0, a) + START + "\n" + lines.join("\n") + "\n  " + html.slice(b);
if (next !== html) {
  fs.writeFileSync(page, next);
  console.log(`wrote ${page}`);
} else console.log(`${page} already up to date`);
