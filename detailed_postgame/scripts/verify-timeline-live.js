#!/usr/bin/env node
// E2E check of a live stat timeline (pg_board.js scanTimeline): reads the newest "[DPS] data timeline" block
// from Deadlock's console.log and compares it with the deadlock-api metadata of the same match.
//   node detailed_postgame/scripts/verify-timeline-live.js <metadata.json> [console.log|-] [label]
// Writes detailed_postgame/live/<match>[-<label>]-timeline-verify.json; exits non-zero on any mismatch.
// Oracles:
//   deaths(t) - the player's own death_details with game_time_s <= t, exact, at every graph column;
//   kills(t)  - every player's death_details whose killer_player_slot is this player, <= t, exact;
//   souls, player damage, objective damage, healing - running totals: never going down, and at each metadata
//   snapshot (stats[].time_stamp_s, every 3-5 min) within 3 % of the nearest column inside 5 s of it. Healing
//   is player_healing without barrier at every column (the board shows the graph's, the last column too).
// A kill or death within 2 s of a column's time is allowed either side (the graph samples are not on the event).
"use strict";
const fs = require("fs");
const path = require("path");

const [metaPath, logArg, label = ""] = process.argv.slice(2);
if (!metaPath) { console.error("usage: verify-timeline-live.js <metadata.json> [console.log|-] [label]"); process.exit(2); }
const logPath = logArg && logArg !== "-" ? logArg : "F:/SteamLibrary/steamapps/common/Deadlock/game/citadel/console.log";
const metaRaw = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const meta = metaRaw.match_info || metaRaw;
const lines = fs.readFileSync(logPath, "latin1").split(/\r?\n/);

function latest(kind) {
  const begin = `[DPS] data ${kind} begin `;
  const item = `[DPS] data ${kind} + `;
  for (let i = lines.length - 1; i >= 0; i--) {
    const at = lines[i].indexOf(begin);
    if (at < 0) continue;
    const count = Number(lines[i].slice(at + begin.length));
    const out = [];
    for (let j = i + 1; j < lines.length && out.length < count; j++) {
      const k = lines[j].indexOf(item);
      if (k >= 0) out.push(JSON.parse(lines[j].slice(k + item.length)));
    }
    if (out.length !== count) throw new Error(`"${kind}" block has ${out.length} of ${count} items`);
    return out;
  }
  throw new Error(`no "[DPS] data ${kind}" block in ${logPath}`);
}

const columns = latest("timeline"); // [{ t, p: [[hero, souls, kills, deaths, pdmg, odmg, heal], ...] }]
const KEYS = ["souls", "kills", "deaths", "pdmg", "odmg", "heal"];
const SNAP = { souls: "net_worth", pdmg: "player_damage", odmg: "boss_damage", heal: "player_healing" };
const players = new Map(meta.players.map((p) => [p.hero_id, p]));
const bySlot = new Map(meta.players.map((p) => [p.player_slot, p]));
const failures = [];
const near = [];
const report = { match: meta.match_id, build: label || undefined, log: logPath, columns: columns.length, checks: {} };

const series = new Map(); // hero -> key -> [value per column]
columns.forEach((col, c) => {
  for (const [hero, ...vals] of col.p) {
    if (!series.has(hero)) series.set(hero, Object.fromEntries(KEYS.map((k) => [k, []])));
    KEYS.forEach((k, i) => { series.get(hero)[k][c] = vals[i]; });
  }
});
const times = columns.map((col) => col.t);

const deathTimes = (p) => (p.death_details || []).map((d) => d.game_time_s);
const killTimes = (p) => meta.players.flatMap((q) => (q.death_details || []).filter((d) => bySlot.get(d.killer_player_slot) === p).map((d) => d.game_time_s));
const countAt = (list, t) => list.filter((x) => x <= t).length;
const countSoft = (list, t) => [countAt(list, t - 2), countAt(list, t + 2)];

let exact = 0;
for (const [hero, s] of series) {
  const p = players.get(hero);
  if (!p) { failures.push(`hero ${hero} not in the metadata`); continue; }
  for (const [key, list] of [["deaths", deathTimes(p)], ["kills", killTimes(p)]]) {
    s[key].forEach((v, c) => {
      if (v === null) { failures.push(`hero ${hero} ${key} at column ${c} unread`); return; }
      const [lo, hi] = countSoft(list, times[c]);
      if (v < lo || v > hi) failures.push(`hero ${hero} ${key} at ${times[c]} s: board ${v}, metadata ${countAt(list, times[c])}`);
      else exact++;
    });
  }
  for (const key of ["souls", "pdmg", "odmg", "heal"]) {
    const v = s[key];
    v.forEach((x, c) => { if (c && x !== null && v[c - 1] !== null && x < v[c - 1]) failures.push(`hero ${hero} ${key} goes down at ${times[c]} s: ${v[c - 1]} -> ${x}`); });
    for (const snap of p.stats || []) {
      const c = times.findIndex((t) => Math.abs(t - snap.time_stamp_s) <= 5);
      if (c < 0 || v[c] === null) continue;
      const want = snap[SNAP[key]];
      const off = Math.abs(v[c] - want);
      near.push({ hero, key, t: snap.time_stamp_s, column: times[c], board: v[c], metadata: want });
      if (off > Math.max(30, 0.03 * want)) failures.push(`hero ${hero} ${key} at ${snap.time_stamp_s} s (column ${times[c]} s): board ${v[c]}, metadata ${want}`);
    }
  }
}
report.checks.killsDeaths = { compared: exact + failures.filter((f) => / (kills|deaths) at /.test(f)).length, ok: exact };
report.checks.snapshots = near;
report.failures = failures;
const out = path.join(__dirname, "..", "live", `${meta.match_id}${label ? `-${label}` : ""}-timeline-verify.json`);
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${columns.length} columns, ${series.size} players: ${exact} kill/death values exact, ${near.length} snapshot values compared, ${failures.length} failure(s) -> ${out}`);
for (const f of failures.slice(0, 20)) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
