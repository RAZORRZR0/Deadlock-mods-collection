// Detailed Post Scoreboard Menu (pak11): the Night Shift post-game stats board, forked from
// observer_hud/panorama/scripts/observer_hud/pg_board.js without the observer extras (match cards,
// team logos, organiser, aliases, the hosted store page). Shared board logic is kept textually identical in both forks (synced both ways); edit both.
// Runs in the board layout that pg_loader.js loads into #ScoreboardScreen. Two halves:
//   scan   - reads everything offline from the stock page: exact row values through injected
//            {i:...} labels, then the stock graph's tooltip column by column (soul lead per team,
//            souls by source per player) and the Lane Stats panel (objective destroy times).
//            The tooltip is opened with DispatchPanelEvent on a graph column (ENGINE.md: the
//            direct CitadelShowPostGameGraphsTooltip event has no JS factory and never parses).
//   render - the Night Shift layout: header, 12 player columns, label column, lead graph.
// Logs [DPS] lines to console.log; the [DPS] data lines are the E2E artifact.
(() => {
  "use strict";

  const TAG = "[DPS]";
  // STANDALONE ONLY (pak11): credit + donate strip under the stock page nav; observer_hud has its own branding and none of this.
  const MOD_VERSION = "3";
  const CREDIT_TEXT = `DETAILED POSTGAME V${MOD_VERSION} BY HANTURAYA`;
  const DONATE_URL = "https://ko-fi.com/hantuaraya";
  // Event-driven (plan phase 2): the match event (CitadelMatchDetailsUpdated) and a screen pick
  // (CitadelPostGameSelectScreenIndex) check at once; otherwise one check a second. While the page is
  // hidden that check reads only PageVisible: live, reopening a match already loaded this session
  // brought no event, and the Scoreboard pick woke nothing (a sleeping board showed the old match).
  const FLOOR_S = 1; // safety check, shown or hidden
  const BURST_S = 0.1; // after an event: waiting for the rows, the page or the screen focus
  const MATCH_WAKE_MS = 5000; // burst after the match event (and at boot: the page loads for a match)
  const SCREEN_WAKE_MS = 1000; // burst after a screen pick (the carousel sets Focused)
  const INTRO_RESET_MS = 1000; // off the Scoreboard screen this long (the carousel has moved it away): entrance re-armed
  const LOADING_MAX_MS = 30000; // stop showing "loading" after this (a failed load shows the stock error)
  const SCAN_FROM = 0.2; // progress share of the rows; the scan steps fill the rest
  const TIP_ID = "PostGameGraphTooltip";
  const COLUMN = "file://{resources}/layout/detailed_postgame/pg_column.xml";
  const FRAME_TRIES = 12; // frames a scan step may wait for the graph to redraw
  const ctx = $.GetContextPanel();
  if (typeof ctx.NSStop === "function") ctx.NSStop();
  let stopped = false;
  let matchListener = null;
  ctx.NSStop = () => {
    stopped = true;
    try { if (S.hovered) unhover(); } catch (e) { /* page gone */ }
    if (matchListener !== null) {
      try { $.UnregisterForUnhandledEvent("CitadelMatchDetailsUpdated", matchListener); } catch (e) { /* already gone */ }
      matchListener = null;
    }
    // A reloaded script starts with none of this run's memory: its columns go with it (the next run
    // would stack its own beside them).
    try { teardown(); } catch (e) { /* page gone */ }
    try { prefsClose(); } catch (e) { /* page gone */ }
  };

  // [key, bound value, stock award class]; the label column in pg_board.xml is in the same order.
  const STATS = [
    ["souls", "{i:net_worth}", "AwardSouls"],
    ["kills", "{i:player_kills}", "AwardKills"],
    ["deaths", "{i:player_deaths}", ""],
    ["assists", "{i:player_assists}", "AwardAssists"],
    ["pdmg", "{i:player_dmg}", "AwardPlayerDmg"],
    ["odmg", "{i:obj_dmg}", "AwardObjDmg"],
    ["heal", "{i:player_healing}", "AwardHealing"] // healing + barrier, like stock (user decision)
  ];
  // Then the scoreboard's healing split (its healing tooltip; SUPPORT section), empty when unbound.
  const BIND = STATS.map((s) => s[1]).concat(["{i:hero_id}", "{s:match_id}", "{s:match_minutes}", "{s:match_seconds}",
    "{i:player_healing_healing}", "{i:player_healing_barriering}"]).join("|");
  const BIND_PARTS = STATS.length + 6;
  // Stock tooltip label -> [css key, display name].
  const SOURCES = {
    "Troopers": ["troopers", "Troopers"],
    "Haunts": ["neutrals", "Neutrals"],
    "Breakable Pickups": ["breakables", "Breakables"],
    "Team Catch-Up": ["bonus", "Team Bonus"],
    "Enemy Kills": ["kills", "Enemy Kills"],
    "Objectives": ["objectives", "Objectives"],
    "Urn": ["urn", "Urn"],
    "Kill Assists": ["assists", "Assists"],
    "Denies": ["denies", "Denies"]
  };
  const LANE_TIERS = [["LaneStatTier1", "tier1"], ["LaneStatTier2", "tier2"], ["LaneStatBarracks", "base"]];
  // Layout numbers shared with pg_board.css: GRAPH_H and the 1600 px plot = .NSGraphPlot; CHART_W =
  // .NSGraphMid; the 105 px column = .NSColumn/.NSPaper/.NSPortrait; 702 px team and 196 px gutter
  // (layoutScoreboard) = .NSHeadSide/.NSTeam and .NSHeadCentre/.NSLabels/.NSProgress. Change both.
  const GRAPH_H = 112; // the plot; the canvas fills it (1600 x 112)
  const CHART_W = 1512; // the lead's x range; the right gutter holds the final-lead pill
  // Width the board needs: 1600 plus the final-lead pill's overhang (16 px, estimated) and an 8 px margin on both
  // sides (the frame is centred). A narrower screen (4:3, 5:4) scales the frame and the stock scoreboard down to fit (fitWrite).
  const FIT_NEED = 1648;
  const FIT_FROM = 22; // the frame's margin-top (px, not scaled by the frame's own ui-scale)
  const HAIR = 2; // the thinnest canvas stroke: at least one full screen pixel down to 720p (UI scale 0.67)
  // Objective drop lines are panels in #NSGraphStems, outside the paper's mask, from just under the dot past
  // the time ticks to the icons: one piece, so no seam where the paper ends (user 2026-10-29: a canvas part
  // over a panel part did not match). STEM_END = .NSGraphStems height (plot 112 + ticks 18 + 4 into the icon).
  const STEM_END = 134;

  const ok = (p) => !!(p && p.IsValid && p.IsValid());
  const log = (msg) => $.Msg(`${TAG} ${msg}`);
  const logged = new Set();
  const logOnce = (key, msg) => { if (!logged.has(key)) { logged.add(key); log(msg); } };
  // E2E artifact: one console line per item, because console.log cuts a $.Msg near 2 KB
  // (live: the souls array ran into the next line). verify-live.js reads the newest block.
  const logData = (kind, items) => {
    log(`data ${kind} begin ${items.length}`);
    for (const item of items) log(`data ${kind} + ${JSON.stringify(item)}`);
  };
  const num = (text) => { const n = parseInt(String(text).replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : 0; };
  // "27:51", "1:02:03" or "-0:05" -> seconds; null for anything else (oh_state.js parseClock).
  const parseClock = (text) => {
    const match = /^\s*(-?)(\d+):(\d{2})(?::(\d{2}))?\s*$/.exec(String(text || ""));
    if (!match) return null;
    const parts = match[4] === undefined ? [0, +match[2], +match[3]] : [+match[2], +match[3], +match[4]];
    const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return match[1] ? -seconds : seconds;
  };
  const secs = (text) => { const s = parseClock(text); return s === null ? -1 : s; };
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const fmtK = (v) => `${(v / 1000).toFixed(1)}K`;

  const UI = {
    page: null, screen: null, scoreboard: null, graphs: null, tip: null,
    names: [null, null], results: [null, null], worth: [null, null], kills: [null, null],
    clock: null, match: null, mode: null, soulsLabel: null, frame: null,
    graph: null, draw: null, canvas: null, marks: null, peaks: [null, null], end: null, ticks: null, events: null, stems: null,
    top: null, bottom: null, topScale: null, bottomScale: null,
    hover: null, strips: null, cursor: null, cursorDot: null, chip: null, // stat timeline
    rowLabels: [], rowHint: null, pips: null, buyNote: null, // the seven row labels; the "click a row name" hint; the hovered row's bars
    progress: null, progressFill: null, progressText: null, progressStep: null,
    credit: null, creditDonate: null // standalone-only credit strip
  };
  const S = {
    key: "",
    pipSlot: -1, // the row name the mouse is on (its bars show, rowPips); -1: none
    walkers: null, // [team 1, team 2] seconds of each enemy Walker the team killed (lead graph lanes); null: not read
    flex: false, // the extra-slot locks are shown (checkFlex)
    namesGen: -1, // the build whose item icons were read (scanItemNames)
    gen: 0,
    rescan: null, // a scan to run again (retryScan): { m, gen, attempt, at }
    stockHidden: [], // stock labels hidden by show(): opacity 0 and no hit testing until teardown
    cols: [], // per player row: { hero, column, souls, plate, nameBlock, items, delay }
    focused: false, // the Scoreboard screen was focused at the last check
    blurAt: 0, // Date.now() when it lost focus
    introShown: false, // the entrance has played since the board was built or re-armed
    introToken: 0, // bumps on every entrance change; a stale scheduled item fade-in does nothing
    hovered: null, // the graph column the scan last hovered (its stock onmouseout closes the tooltip)
    sig: "", // first row's bound text when the board was built (steady-state check)
    bound: null, // that bound label (ours, inside a reused stock row)
    loadingSince: 0, // Date.now() when the visible page started waiting for match rows
    progressGen: 0, // bumps on every progress change so a stale fade-out does not hide a new run
    hooked: null, // the page whose screen-pick event wakes the board
    loop: 0, // token of the one scheduled check; a wake supersedes a pending one
    burstUntil: 0, // Date.now() until which the board checks at BURST_S
    scanning: 0, // gen of the scan in progress (0: none); the tooltip stays muted while it runs
    graphScale: 0, // the lead graph's scale (0: no graph drawn)
    fitScale: 1, // the factor on the frame and the scoreboard (1: nothing written)
    fitOn: false, // a factor below 1 was written and is still on the panels
    fitLogged: 1, // the last factor logged (a rebuild writes it again without a new line)
    revealToken: 0, // the running graph wipe; a new one supersedes it
    graphDraws: [], // the lead graph's canvas strokes, painted by paint()
    matchId: "", // the shown match's id (copied by a click on #NSMatch)
    mode: "", // the game mode from the stock .MatchMode label, upper case ("" until it binds)
    copyToken: 0, // the running "copied" feedback; a newer click or match supersedes it
    head: null, // the header's final texts and each team's heroes: { worth: [2], kills: [2], clock, heroes: [2][] }
    finalSouls: new Map(), // hero -> the scan's souls-by-source tooltip at the end
    timeline: null, // the stat timeline: { n, times, by: hero -> { <key>: [n], src: [n] }, heroes }
    graphYOf: null, // lead -> y in the plot (renderGraph), for the hover dot
    leadAt: new Map(), // graph column time -> lead (team 1 minus team 2)
    duration: 0, // the drawn graph's match length (s)
    hoverCol: -1, // the graph column under the mouse (-1: none, final numbers shown)
    hoverToken: 0, // bumps on every hover change; a stale delayed restore does nothing
    rows: STATS.map(([key]) => key), // the seven rows' stat keys ("" = empty row); kept for the next match and saved
    matchDur: 0 // the shown match's length (s), for the per-minute stats
  };

  // ---------- discovery ----------

  function findPage() {
    let p = ctx;
    while (ok(p) && p.paneltype !== "CitadelPostGameNew") p = p.GetParent();
    return ok(p) ? p : null;
  }

  function windowRoot() {
    let p = ctx;
    while (ok(p) && ok(p.GetParent())) p = p.GetParent();
    return p;
  }

  function bindUI() {
    for (const i of [1, 2]) {
      UI.names[i - 1] = ctx.FindChildTraverse(`NSTeamName${i}`);
      UI.results[i - 1] = ctx.FindChildTraverse(`NSResult${i}`);
      UI.worth[i - 1] = ctx.FindChildTraverse(`NSWorth${i}`);
      UI.kills[i - 1] = ctx.FindChildTraverse(`NSKills${i}`);
    }
    UI.clock = ctx.FindChildTraverse("NSClock");
    UI.match = ctx.FindChildTraverse("NSMatch");
    UI.mode = ctx.FindChildTraverse("NSMode");
    UI.soulsLabel = ctx.FindChildTraverse("NSSoulsLabel");
    UI.labels = ctx.FindChildTraverse("NSLabels");
    UI.graph = ctx.FindChildTraverse("NSGraph");
    UI.draw = ctx.FindChildTraverse("NSGraphDraw");
    UI.canvas = ctx.FindChildTraverse("NSGraphCanvas");
    UI.marks = ctx.FindChildTraverse("NSGraphMarks");
    UI.peaks = [ctx.FindChildTraverse("NSGraphPeak1"), ctx.FindChildTraverse("NSGraphPeak2")];
    UI.end = ctx.FindChildTraverse("NSGraphEnd");
    UI.ticks = ctx.FindChildTraverse("NSGraphTicks");
    UI.events = ctx.FindChildTraverse("NSGraphEvents");
    UI.stems = ctx.FindChildTraverse("NSGraphStems");
    UI.top = ctx.FindChildTraverse("NSGraphTop");
    UI.bottom = ctx.FindChildTraverse("NSGraphBottom");
    UI.topScale = ctx.FindChildTraverse("NSGraphTopScale");
    UI.bottomScale = ctx.FindChildTraverse("NSGraphBottomScale");
    UI.hover = ctx.FindChildTraverse("NSGraphHover");
    UI.strips = ctx.FindChildTraverse("NSGraphStrips");
    UI.cursor = ctx.FindChildTraverse("NSGraphCursor");
    UI.cursorDot = ctx.FindChildTraverse("NSGraphCursorDot");
    UI.chip = ctx.FindChildTraverse("NSGraphChip");
    const rowLabels = ctx.FindChildTraverse("NSRowLabels");
    UI.rowLabels = ok(rowLabels) ? rowLabels.Children() : [];
    UI.rowHint = ctx.FindChildTraverse("NSRowHint");
    UI.buyNote = ctx.FindChildTraverse("NSBuyNote");
    UI.progress = ctx.FindChildTraverse("NSProgress");
    UI.progressFill = ctx.FindChildTraverse("NSProgressFill");
    UI.progressText = ctx.FindChildTraverse("NSProgressText");
    UI.progressStep = ctx.FindChildTraverse("NSProgressStep");
    UI.frame = ctx.FindChildTraverse("NSFrame");
    if (ok(UI.match)) UI.match.SetPanelEvent("onactivate", copyMatchId);
    // standalone-only credit strip: the text carries the version, only the donate label takes clicks
    UI.credit = ctx.FindChildTraverse("NSCredit");
    UI.creditDonate = ctx.FindChildTraverse("NSCreditDonate");
    const creditText = ctx.FindChildTraverse("NSCreditText");
    if (ok(creditText)) creditText.text = CREDIT_TEXT;
    if (ok(UI.creditDonate)) UI.creditDonate.SetPanelEvent("onactivate", openDonate);
  }

  // ---------- credit strip (standalone only) ----------
  // The strip follows the frame: NSOn with the board, NSIntro with its entrance (that also makes the donate label hittable).
  function openDonate() {
    try { $.DispatchEvent("ExternalBrowserGoToURL", DONATE_URL); } catch (e) { log(`donate link: ${e}`); }
  }
  function creditSet(on, intro) {
    const p = UI.credit;
    if (!ok(p)) return;
    if (on) p.AddClass("NSOn"); else p.RemoveClass("NSOn");
    if (intro) p.AddClass("NSIntro"); else p.RemoveClass("NSIntro");
  }

  // ---------- progress bar ----------
  // null fraction = indeterminate (match data still loading; a CSS loop runs instead of the fill).
  // The fill scales on X (transform only, transition in CSS); the bar dries away after 100 %.
  let lastFill = -1;
  function setFill(f) {
    if (f === lastFill || !ok(UI.progressFill)) return;
    lastFill = f;
    UI.progressFill.style.transform = `scale3d(${Math.max(0.001, f)}, 1, 1)`;
  }

  function progress(fraction, label, step) {
    if (!ok(UI.progress)) return;
    S.progressGen++;
    ctx.AddClass("NSBusy");
    UI.progress.RemoveClass("NSDone");
    UI.progress.SetHasClass("NSIndeterminate", fraction === null);
    if (fraction !== null) setFill(Math.round(Math.max(0, Math.min(1, fraction)) * 100) / 100);
    setText(UI.progressText, label);
    setText(UI.progressStep, step || "");
  }

  function progressDone() {
    if (!ok(UI.progress)) return;
    progress(1, "MATCH READ", "");
    UI.progress.AddClass("NSDone");
    const gen = S.progressGen;
    $.Schedule(0.95, () => { if (!stopped && gen === S.progressGen) progressHide(); });
  }

  function progressHide() {
    S.progressGen++;
    ctx.RemoveClass("NSBusy");
    if (ok(UI.progress)) UI.progress.RemoveClass("NSDone");
    setFill(0); // back to empty while hidden, so the next run pours from the left
  }

  function loading() {
    if (!S.loadingSince) S.loadingSince = Date.now();
    if (Date.now() - S.loadingSince < LOADING_MAX_MS) progress(null, "LOADING MATCH", "");
    else progressHide();
  }

  // ---------- rows ----------

  // Row values through a hidden label bound to the row's own dialog variables (exact numbers,
  // stock text is "18k"). The label resolves in the same frame it is created (probe 1).
  function readRow(row) {
    let holder = row.FindChild("NSBinds");
    if (!ok(holder)) {
      holder = $.CreatePanel("Panel", row, "NSBinds", { hittest: "false" });
      holder.style.width = "0px";
      holder.style.height = "0px";
      holder.style.opacity = "0";
      $.CreatePanel("Label", holder, "NSBind", { text: BIND, hittest: "false" });
    }
    const label = holder.FindChild("NSBind");
    const parts = ok(label) ? String(label.text).split("|") : [];
    if (parts.length !== BIND_PARTS || parts.some((p) => p.indexOf("{") >= 0)) return null;
    const v = { row, text: {}, value: {}, award: {}, hero: num(parts[STATS.length]), account: "" };
    STATS.forEach(([key, , award], i) => {
      v.text[key] = parts[i];
      v.value[key] = num(parts[i]);
      v.award[key] = !!award && row.BHasClass(award);
    });
    v.matchId = parts[STATS.length + 1];
    v.duration = num(parts[STATS.length + 2]) * 60 + num(parts[STATS.length + 3]);
    v.split = { healing: num(parts[STATS.length + 4]), barrier: num(parts[STATS.length + 5]) };
    // Stock MVP marks: MVP_Rank1 = MVP (mvp_trophy), MVP_Rank2/3 = Key Player (key_player_trophy).
    v.mvp = row.BHasClass("MVP_Rank1") ? 1 : row.BHasClass("MVP_Rank2") ? 2 : row.BHasClass("MVP_Rank3") ? 3 : 0;
    const name = row.FindChildTraverse("PlayerName");
    try { v.account = ok(name) ? String(name.accountid || "") : ""; } catch (e) { v.account = ""; }
    return v;
  }

  function readTeam(index) {
    const team = UI.scoreboard.FindChildTraverse(`Team${index}`);
    const players = ok(team) ? team.FindChildTraverse("TeamPlayers") : null;
    if (!ok(players)) return null;
    const rows = [];
    let totals = null;
    for (const row of players.Children()) {
      const v = readRow(row);
      if (!v) return null;
      if (row.BHasClass("TotalsRow")) totals = v;
      else if (v.hero > 0) rows.push(v);
      else return null;
    }
    if (!totals || rows.length === 0) return null;
    return { win: team.BHasClass("IsWinningTeam"), rows, totals };
  }

  function readMatch() {
    const teams = [readTeam(1), readTeam(2)];
    if (!teams[0] || !teams[1]) return null;
    healingWithBarriers(teams);
    const first = teams[0].rows[0];
    return { id: first.matchId, duration: first.duration, teams };
  }
  // HEALING is healing + barriers, as Statlocker and deadlock-api count it (user 2026-11-23). The stock
  // {i:player_healing} also takes the player's self-damage off (match 137998268, metadata: Shiv 4,544 - 1,833 =
  // 2,711, Lady Geist 34,686 - 18,118 = 16,568), so it could read below the HEALING ONLY row; its AwardHealing star
  // follows that number, so the star is worked out here (ties all starred, none when nobody healed).
  function healingWithBarriers(teams) {
    const players = teams[0].rows.concat(teams[1].rows);
    const like = players.map((r) => r.text.souls).find((t) => /\d[^\d]\d{3}/.test(t)) || "";
    for (const r of players.concat([teams[0].totals, teams[1].totals])) {
      r.value.heal = r.split.healing + r.split.barrier;
      r.text.heal = fmtLike(like, r.value.heal);
    }
    const top = Math.max(...players.map((r) => r.value.heal));
    for (const r of players) r.award.heal = top > 0 && r.value.heal === top;
  }

  const matchKey = (m) => `${m.id}:${m.teams.map((t) => t.rows.map((r) => r.hero).join(",")).join("/")}`;

  // ---------- render: header and columns ----------

  function setText(label, text) {
    if (ok(label) && label.text !== text) label.text = text;
  }

  function renderHeader(m) {
    const anyWin = m.teams[0].win || m.teams[1].win;
    m.teams.forEach((t, i) => {
      setText(UI.names[i], $.Localize(`#Citadel_Team${i + 1}_Name`));
      setText(UI.results[i], anyWin ? (t.win ? "VICTORY" : "DEFEAT") : "");
      if (ok(UI.results[i])) {
        UI.results[i].SetHasClass("NSWin", anyWin && t.win);
        UI.results[i].SetHasClass("NSLoss", anyWin && !t.win);
      }
      setText(UI.worth[i], fmtK(t.totals.value.souls));
      setText(UI.kills[i], String(t.totals.value.kills));
    });
    setText(UI.clock, clock(m.duration));
    S.head = { worth: UI.worth.map((l) => (ok(l) ? l.text : "")), kills: UI.kills.map((l) => (ok(l) ? l.text : "")), clock: clock(m.duration),
      heroes: m.teams.map((t) => t.rows.map((r) => r.hero)) };
    S.matchId = String(m.id || "");
    S.matchDur = m.duration;
    S.copyToken++; // a pending "copied" label is replaced by this match's
    S.mode = "";
    setText(UI.mode, "");
    readMode();
    setText(UI.match, matchLine());
    if (ok(UI.match)) UI.match.RemoveClass("NSCopied");
  }

  // The game mode (Standard, Ranked, Street Brawl...) from the stock .MatchMode label ({s:match_mode}),
  // which the board hides; shown on its own line over the match id (user 2026-11-14; one line
  // "STANDARD MATCH (LOBBY) | MATCH 121685912" was cut with an ellipsis, user 2026-11-23). An unbound
  // label reads as nothing.
  function matchLine() {
    return `MATCH ${S.matchId}`;
  }
  function readMode() {
    if (stopped || !ok(UI.screen)) return;
    let mode = "";
    for (const kid of UI.screen.Children()) {
      if (!kid.BHasClass("MatchMode")) continue;
      const t = labelText(kid);
      if (t && !t.includes("{") && !t.startsWith("#")) mode = t.toUpperCase();
    }
    if (!mode || mode === S.mode) return;
    S.mode = mode;
    log(`mode: ${mode}`);
    setText(UI.mode, mode);
  }

  // ---------- copy the match id ----------
  // The board hides the stock #MatchID labels (opacity 0), so its own #NSMatch copies the id on click, with
  // the stock action those labels use: CitadelPostGameCopyMatchID(). Its page callback copies the page's
  // uint64 match id as decimal text (Plat_SetClipboardText) and anchors its success feedback on the source
  // panel, here #NSMatch (client.dll 6821 0x181b2bcb0). If dispatching it throws, a laid-out TextEntry with
  // the id is selected and copied (TextEntryCopyToClipboard; CopyStringToClipboard threw in the Escape menu).
  const COPIED_S = 1.5;
  function copyByEntry(text) {
    const entry = ctx.FindChildTraverse("NSCopyEntry"); // laid out from the start (pg_board.xml)
    if (!ok(entry)) return false;
    let copied = false;
    try {
      entry.text = text;
      entry.SetFocus();
      entry.SelectAll();
      copied = $.DispatchEvent("TextEntryCopyToClipboard", entry) !== false;
    } catch (e) { copied = false; }
    try { $.DispatchEvent("DropInputFocus", entry); } catch (e) { /* focus stays */ }
    return copied;
  }
  function copyMatchId() {
    if (stopped || !S.matchId || !ok(UI.match)) return;
    let route = "";
    try {
      $.DispatchEvent("CitadelPostGameCopyMatchID", UI.match);
      route = "stock";
    } catch (e) { route = ""; }
    if (!route && copyByEntry(S.matchId)) route = "entry";
    log(`match id ${route ? `copied (${route})` : "not copied"}`);
    const token = ++S.copyToken;
    setText(UI.match, route ? "MATCH ID COPIED" : matchLine());
    UI.match.SetHasClass("NSCopied", !!route);
    $.Schedule(COPIED_S, () => {
      if (stopped || token !== S.copyToken || !ok(UI.match)) return;
      setText(UI.match, matchLine());
      UI.match.RemoveClass("NSCopied");
    });
  }

  // Stock panels are restyled in place, never moved to another parent: C++ looks row children up by id later
  // and a missing one is fatal (live 2026-10-25: "FATAL ERROR: Unable to find child 'ItemsContainer'"
  // after ItemsContainer was reparented). Our own panels are created inside the stock rows. Reordering within
  // the same parent keeps the lookup (#CopyBuildButton, live 2026-11-23).
  function css(panel, styles) {
    if (!ok(panel)) return;
    for (const key of Object.keys(styles)) panel.style[key] = styles[key];
  }
  const hide = (panel) => css(panel, { visibility: "collapse" });
  // Stock labels the board hides with opacity 0 (#MatchID, .MatchMode) would still take hover and click and show
  // their stock "Copy match ID" tooltip over empty space: hit testing goes off with them and teardown restores both.
  // The board's own #NSMatch copies the id (copyMatchId) and does not depend on the stock label.
  function stockHit(panel, on) {
    if (!ok(panel)) return;
    try { panel.hittest = on; panel.hittestchildren = on; } catch (e) { /* property missing: opacity alone */ }
  }
  function stockHide(panel) {
    css(panel, { opacity: "0" });
    stockHit(panel, false);
    if (!S.stockHidden.includes(panel)) S.stockHidden.push(panel);
  }
  function stockRestore() {
    for (const panel of S.stockHidden) {
      css(panel, { opacity: "1" });
      stockHit(panel, true);
    }
    S.stockHidden = [];
  }

  // The 700 px body (and the graph 8 px under it) fits 4 rows of final items; each further row of 3 icons runs
  // into the soul lead graph. The graph moves down by the missing height, capped so its objective icons stay
  // above the stock bottom controls (Back / page dots / Watch Replay).
  const ITEM_ROW_PX = 34.75; // 45 px icon at 75% + 1 px margin
  const ITEM_PER_ROW = 3;
  const ITEMS_ROOM_PX = 164; // item grid top (y 674) to the graph's top (y 838)
  const ITEMS_CLEAR_PX = 6;
  const GRAPH_GAP_PX = 8; // the stylesheet's .NSGraph margin-top
  const GRAPH_PUSH_MAX_PX = 26;
  // Item icons per column. The stock rows may get icons after the board is built, so step() looks at one
  // column per check (the steady-state call budget) and fits the graph again when its count changed.
  const itemCounts = () => S.cols.map((c) => (ok(c.items) ? c.items.GetChildCount() : 0));
  function recountItems() {
    if (!S.itemCounts || !S.cols.length) return;
    S.itemAt = ((S.itemAt || 0) + 1) % S.cols.length;
    let n = -1;
    try { n = S.cols[S.itemAt].items.GetChildCount(); } catch (e) { return; }
    if (n !== S.itemCounts[S.itemAt]) fitGraph();
  }
  function fitGraph() {
    if (!ok(UI.graph)) return;
    const counts = itemCounts();
    S.itemCounts = counts;
    const most = Math.max(0, ...counts);
    const rows = Math.ceil(most / ITEM_PER_ROW);
    const push = Math.min(GRAPH_PUSH_MAX_PX, Math.max(0, Math.ceil(rows * ITEM_ROW_PX + ITEMS_CLEAR_PX - ITEMS_ROOM_PX)));
    css(UI.graph, { marginTop: `${GRAPH_GAP_PX + push}px` });
    log(`items: ${most} max, ${rows} rows, graph pushed ${push}px, per column ${counts.join(",")}`);
  }

  function labelText(panel) {
    if (!ok(panel)) return "";
    if (typeof panel.text === "string" && panel.text.trim()) return panel.text.trim();
    for (const kid of panel.Children()) {
      const t = labelText(kid);
      if (t) return t;
    }
    return "";
  }

  // Rows start where the board's body starts (y 130). Stock draws the scroll container
  // (.ScoreboardScrollContainer) translateY(80px) below its box; live the rows sat 81 px below the
  // scoreboard's margin. The translation is removed and its 80 px added to the margin: drawn outside
  // the scoreboard's box, the bottom 80 px of the rows took no hover (live 2026-10-25: the 3rd and 4th
  // item rows). Heights are fit-children because stock row and team heights clip the taller columns
  // (items went missing).
  const STOCK_SHIFT = 80;
  const ROWS_TOP = 49 + STOCK_SHIFT;
  // Rows' top under the fit. The panel's own margin is not scaled by its own ui-scale, so the scoreboard's margin-top
  // is written by hand: the frame's 22 px stays, the rest (ROWS_TOP - FIT_FROM) shrinks with s. At s = 1 this is ROWS_TOP.
  const fitTop = (s) => Number((FIT_FROM + (ROWS_TOP - FIT_FROM) * s).toFixed(2));
  const fitUi = (s) => (s < 1 ? `${(s * 100).toFixed(1)}%` : "100%");
  // Virtual width: the page's laid-out width over its ui scale (0 until the layout is ready).
  function fitWidth() {
    const w = Number(ctx.actuallayoutwidth);
    const k = Number(ctx.actualuiscale_x);
    return w > 0 && k > 0 ? w / k : 0;
  }
  // ui-scale is a layout scale: the 1600 px panels become 1600 * s and fit the page. pre-transform-scale2d was tried
  // first and clipped both panels at the page width before the transform (live 2026-11-13, build 6861), so the outer
  // columns and graph ends were cut. Written on the frame and the scoreboard; factor 1 after a scale writes 100%.
  function fitWrite(s) {
    if (s < 1) S.fitOn = true; else if (!S.fitOn) return;
    for (const p of [UI.frame, UI.scoreboard]) css(p, { uiScale: fitUi(s) });
    css(UI.scoreboard, { marginTop: `${fitTop(s)}px` });
    if (s >= 1) S.fitOn = false;
  }
  // From the 1 s check and the build: nothing is written while the width is unknown or the factor is unchanged.
  function fitBoard() {
    const w = fitWidth();
    if (!(w > 0)) return;
    const s = Math.min(1, Math.floor((w / FIT_NEED) * 1000) / 1000);
    if (s === S.fitScale) return;
    S.fitScale = s;
    fitWrite(s);
    if (s === S.fitLogged) return;
    S.fitLogged = s;
    log(`fit: width ${Math.round(w)}, scale ${s}`);
  }
  function layoutScoreboard() {
    const sb = UI.scoreboard;
    css(sb, { width: "1600px", height: "fit-children", horizontalAlign: "center", verticalAlign: "top", marginTop: `${fitTop(S.fitScale)}px`, marginBottom: "0px", padding: "0px", uiScale: fitUi(S.fitScale), overflow: "noclip" });
    const inner = sb.GetChild(0);
    css(inner, { width: "1600px", height: "fit-children", flowChildren: "right", padding: "0px", margin: "0px", overflow: "noclip", transform: "none" });
    hide(sb.FindChildTraverse("MatchInfoContainer"));
    for (const i of [1, 2]) {
      const team = sb.FindChildTraverse(`Team${i}`);
      css(team, { width: "702px", height: "fit-children", flowChildren: "down", margin: "0px", padding: "0px", backgroundColor: "#00000000", overflow: "noclip" });
      if (i === 2) css(team, { marginLeft: "196px" });
      hide(ok(team) ? team.FindChildTraverse("TeamTableHeader") : null);
      const players = ok(team) ? team.FindChildTraverse("TeamPlayers") : null;
      // Fewer than 6 players (Street Brawl 4v4, user 2026-11-14): the columns hug the label column on both sides.
      css(players, { width: "fit-children", height: "fit-children", flowChildren: "right", horizontalAlign: i === 1 ? "right" : "left", margin: "0px", padding: "0px", overflow: "noclip" });
    }
  }

  // Player name: our own CitadelUserName (live: shows the account name); if it shows no text
  // after a second, the stock name block (which ShowRank may extend) is shown instead.
  function renderName(plate, r, nameBlock, main, column) {
    let own = null;
    try {
      own = $.CreatePanel("CitadelUserName", plate, "", { accountid: r.account, hittest: "false" });
    } catch (e) {
      own = null;
    }
    $.Schedule(1.0, () => {
      if (stopped || !ok(plate)) return;
      if (ok(own) && labelText(own)) return;
      if (!ok(nameBlock)) { logOnce("name:none", "names: no name for a row"); return; }
      hide(plate);
      css(nameBlock, { visibility: "visible", width: "105px", height: "36px", backgroundColor: "#1c1d22", margin: "0px" });
      main.MoveChildBefore(column, nameBlock);
      logOnce("name:stock", `names: own CitadelUserName empty; showing the stock name ("${labelText(nameBlock)}")`);
    });
  }

  // CitadelModIcon is 51 px (3 px padding + 45 px art) with overflow noclip: forcing a smaller
  // size let each neighbour draw over the art ("half cropped", live). Scale instead: no padding,
  // the 45 px container at ui-scale 75% = 33.75 px, three across in 105 px; stock hover and
  // tooltip stay as they are, and the hovered item is lifted over its neighbours (hoverItems).
  function styleItems(items) {
    // Stock gives ItemsContainer a parent-relative height, which is 0 inside a fit-children row
    // (live: h=0 with the icons centred on it, so nothing showed).
    css(items, { width: "105px", height: "fit-children", padding: "0px", margin: "6px 0px 0px 0px", uiScale: "100%", flowChildren: "right-wrap", horizontalAlign: "left", verticalAlign: "top", overflow: "noclip", visibility: "visible" });
    // Stock icons are vertical-align: center, which stacks every wrapped row on the middle one.
    for (const icon of items.Children()) {
      css(icon, { width: "45px", height: "45px", padding: "0px", uiScale: "75%", margin: "0px 1px 1px 0px", verticalAlign: "top", horizontalAlign: "left", opacity: "1", saturation: "1" });
    }
    items.SetPanelEvent("onmouseover", () => hoverItems(items));
    items.SetPanelEvent("onmouseout", () => unhoverItems(items));
  }

  // ---------- item hover ----------
  // Live (client 6819, 2026-10-26): the stock "#ItemsContainer CitadelModIcon:hover" scales an item 1.5x and
  // later siblings drew over it: the next item, the next wrapped row, the next player's items. The stock
  // ItemsContainer gets onmouseover/onmouseout while any of its items is hovered (the items keep their stock
  // tooltips), so while the mouse is in one player's items a short poll finds the hovered item
  // (BHasHoverStyle) and an inline z-index lifts it, and its ancestors up to the scoreboard over their
  // siblings. Nothing runs while no items are hovered.
  const HOVER_S = 0.02;
  const HOVER = { items: null, icon: null, chain: [], token: 0 };
  function lift(panel, on) {
    if (ok(panel)) panel.style.zIndex = on ? "1" : "0";
  }
  function hoverItems(items) {
    if (stopped || HOVER.items === items) return;
    unhoverItems(HOVER.items);
    HOVER.items = items;
    HOVER.chain = [];
    wantBuys(); // the buy times shown on a hovered item
    for (let p = items; ok(p) && p !== UI.scoreboard; p = p.GetParent()) HOVER.chain.push(p);
    for (const p of HOVER.chain) lift(p, true);
    pollHover(++HOVER.token);
  }
  function pollHover(token) {
    if (stopped || token !== HOVER.token) return;
    const items = HOVER.items;
    // A lost onmouseout (the page closed, rows rebuilt) ends it too.
    if (!ok(items) || !items.BHasHoverStyle()) { unhoverItems(items); return; }
    let hovered = null;
    for (const icon of items.Children()) if (icon.BHasHoverStyle()) { hovered = icon; break; }
    if (hovered !== HOVER.icon) {
      lift(HOVER.icon, false);
      buyLabel(HOVER.icon, false);
      lift(hovered, true);
      buyLabel(hovered, true);
      HOVER.icon = hovered;
    }
    $.Schedule(HOVER_S, () => pollHover(token));
  }
  function unhoverItems(items) {
    if (!items || HOVER.items !== items) return;
    HOVER.token++;
    lift(HOVER.icon, false);
    buyLabel(HOVER.icon, false);
    for (const p of HOVER.chain) lift(p, false);
    HOVER.items = null;
    HOVER.icon = null;
    HOVER.chain = [];
  }

  // ---------- commend and create build ----------
  // The stock commend button lives in the row's first child, .CommendContainer (stock
  // citadel_db_post_game_scoreboard_new.xml). It stays there (never reparented), floats over the portrait's top
  // left (user 2026-11-23; top right before) and shows while the player card is hovered (user 2026-11-14).
  // The stock "Create Build" button (#CopyBuildButton, the .PlayerRow's last child; on click C++ makes a local
  // unpublished build from the player's purchases in this match, sells and imbues included) floats over the top
  // right, shown with the commend button (user 2026-11-23). It is moved to the front of its own parent so it
  // sits over the portrait; it is never reparented. Stock CSS still decides whether it exists:
  // .CanCommendPlayers on the page, no button for bots, the local player or a commended player (who gets the stock
  // commended icon). The button keeps its stock tooltip, hover and click.
  const COMMEND_POLL_S = 0.1;
  // The shared look of the two portrait-corner buttons (commend top left, Create Build top right).
  const CORNER_BUTTON = { width: "28px", height: "28px", verticalAlign: "top", backgroundColor: "#10130Dcc", borderRadius: "50%",
    backgroundPosition: "50% 50%", backgroundRepeat: "no-repeat", preTransformScale2d: "1" };
  const COMMEND = { row: null, token: 0 };
  const commendBox = (row) => (ok(row) ? row.Children().find((k) => k.BHasClass("CommendContainer")) : null);
  function commendShown(row, on) {
    const box = commendBox(row);
    if (ok(box)) css(box.FindChildTraverse("CommendPlayerButton"), { opacity: on ? "1" : "0" });
    if (ok(row)) css(row.FindChildTraverse("CopyBuildButton"), { opacity: on ? "1" : "0" });
  }
  // main: the row's .PlayerRow (the button's parent); column: the board's column, already first in main.
  function placeCopyBuild(main, column) {
    const button = main.FindChild("CopyBuildButton");
    if (!ok(button) || !ok(column)) return;
    main.MoveChildBefore(button, column);
    css(button, CORNER_BUTTON);
    css(button, { visibility: "visible", horizontalAlign: "right", margin: "4px 4px -32px 0px", backgroundSize: "14px 18px", washColor: "#FFEFD7",
      zIndex: "2", opacity: "0", transitionProperty: "opacity, brightness", transitionDuration: "0.15s" });
  }
  function placeCommend(row) {
    const box = commendBox(row);
    if (!ok(box)) return;
    css(box, { width: "105px", height: "56px", margin: "0px 0px -56px 0px", padding: "0px", zIndex: "2", overflow: "noclip", visibility: "visible" });
    // Commend (and the stock "commended" badge in its place) and Create Build are the same 28 px dark round
    // button, 4 px in from the portrait's top corners (user 2026-11-23: "not very symmetrical"). The stock
    // local-player caret (#LocalPlayerIdentifier, a blue arrow on your own card) is not shown.
    for (const kid of box.Children()) {
      if (kid.id === "LocalPlayerIdentifier") { hide(kid); continue; }
      css(kid, CORNER_BUTTON);
      css(kid, { horizontalAlign: "left", margin: "4px 0px 0px 4px" });
    }
    css(box.FindChildTraverse("CommendPlayerButton"), { opacity: "0", transitionProperty: "opacity, brightness, pre-transform-scale2d", transitionDuration: "0.15s" });
    row.SetPanelEvent("onmouseover", () => hoverCommend(row));
  }
  function hoverCommend(row) {
    if (stopped || COMMEND.row === row) return;
    commendShown(COMMEND.row, false);
    COMMEND.row = row;
    commendShown(row, true);
    pollCommend(++COMMEND.token);
  }
  // The hover ends when neither the card nor anything in it is hovered (a lost onmouseout ends it too).
  function pollCommend(token) {
    if (stopped || token !== COMMEND.token) return;
    if (ok(COMMEND.row) && COMMEND.row.BHasHoverStyle()) { $.Schedule(COMMEND_POLL_S, () => pollCommend(token)); return; }
    commendShown(COMMEND.row, false);
    COMMEND.row = null;
    COMMEND.token++;
  }

  function decorateRow(r, teamIndex, index, loss) {
    const row = r.row;
    const items = row.FindChildTraverse("ItemsContainer");
    const main = ok(items) ? items.GetParent() : null;
    if (!ok(main)) throw new Error("row without ItemsContainer");
    // visible: C++ reuses rows across matches, and the last match's totals row (hidden by the board) can come
    // back as a player row (user 2026-11-14: a 6v6 after a 4v4 Street Brawl showed 5 columns a side).
    css(row, { width: "105px", height: "fit-children", margin: "0px 6px", padding: "0px", flowChildren: "down", backgroundColor: "#00000000", backgroundImage: "none", overflow: "noclip", visibility: "visible" });
    for (const kid of row.Children()) if (!ok(kid.FindChildTraverse("ItemsContainer")) && kid.id !== "NSBinds" && !kid.BHasClass("CommendContainer")) hide(kid);
    placeCommend(row);
    css(main, { width: "105px", height: "fit-children", flowChildren: "down", margin: "0px", padding: "0px", backgroundColor: "#00000000", overflow: "noclip" });
    let nameBlock = null;
    for (const kid of main.Children()) {
      if (kid.id === "ItemsContainer") continue;
      if (!nameBlock && (kid.id === "PlayerName" || ok(kid.FindChildTraverse("PlayerName")))) nameBlock = kid;
      hide(kid);
    }
    styleItems(items);

    // Script-created panels under a stock row take the scoreboard's stylesheets (live), so the
    // column is our own layout; panels created inside it take ours.
    const column = $.CreatePanel("Panel", main, "", { hittest: "false" });
    if (!column.BLoadLayout(COLUMN, false, false)) throw new Error(`could not load ${COLUMN}`);
    column.AddClass(`NSColumnTeam${teamIndex + 1}`);
    column.AddClass(`NSCol${index + 1}`); // entrance stagger, centre outward (CSS)
    if (loss) column.AddClass("NSLoss"); // critical hero card instead of gloat
    if (r.mvp === 1) column.AddClass("NSMVP");
    else if (r.mvp) column.AddClass("NSKey");
    if (r.mvp) {
      setText(column.FindChildTraverse("NSAwardText"), r.mvp === 1 ? "MVP" : "KEY PLAYER");
    }
    main.MoveChildBefore(column, items);
    placeCopyBuild(main, column);
    for (const id of ["NSPortrait", "NSPortraitLoss"]) {
      const portrait = column.FindChildTraverse(id);
      if (ok(portrait)) portrait.SetHeroID(r.hero);
    }
    const cells = column.FindChildTraverse("NSCells");
    const cellOf = {}; // key -> [cell, value label]: the stat timeline rewrites the values on a graph hover
    STATS.forEach(([key], i) => {
      const cell = $.CreatePanel("Panel", cells, "", { class: "NSCell", hittest: "false" });
      cell.AddClass(`NSCell_${key}`);
      cell.AddClass(`NSSlot${i}`); // the row, whatever stat it shows (Street Brawl drops row 1 by its slot)
      if (i % 2) cell.AddClass("NSOdd");
      if (r.award[key]) { cell.AddClass("NSBest"); cell.AddClass(`NSBest_${key}`); }
      cellOf[key] = [cell, $.CreatePanel("Label", cell, "", { class: "NSCellValue", text: r.text[key], hittest: "false" })];
    });
    renderName(column.FindChildTraverse("NSPlate"), r, nameBlock, main, column);
    // Entrance stagger from the centre outward, as the NSCol delays in pg_board.css; the stock items follow.
    const delay = 0.10 + 0.05 * (teamIndex === 0 ? 5 - index : index);
    const entry = { hero: r.hero, column, souls: column.FindChildTraverse("NSSouls"), plate: column.FindChildTraverse("NSPlate"), nameBlock, items, delay,
      cells: cellOf, text: r.text, award: r.award, value: r.value, split: r.split, teamIndex, teamKills: 0, srcLines: null,
      slots: STATS.map(([key]) => cellOf[key]), slotKey: STATS.map(([key]) => key), slotStar: STATS.map(([key]) => (r.award[key] ? key : "")) };
    S.cols.push(entry);
    css(items, { opacity: "0", transitionProperty: "opacity", transitionDuration: "0.3s", transitionTimingFunction: "ease-out" });
  }

  // The stock items are not ours to class: they fade by an inline transition, shown after their column
  // (live: a transition-delay written with the opacity was ignored and the items popped in first).
  function itemsShown(c, on) {
    if (!on) { css(c.items, { opacity: "0" }); return; }
    const token = S.introToken;
    $.Schedule(c.delay + 0.12, () => { if (!stopped && token === S.introToken) css(c.items, { opacity: "1" }); });
  }

  // Entrance animations start a frame after the panels are created and laid out (a trigger
  // class, never a base-rule animation on a fresh panel).
  function trigger(panels, cls) {
    const gen = S.gen;
    $.Schedule(0, () => {
      if (stopped || gen !== S.gen) return;
      for (const p of panels) if (ok(p)) p.AddClass(cls);
    });
  }

  // A row with nothing to say in this game (Street Brawl, user 2026-11-14) is dropped from the label column and
  // every player column (pg_board.css: NSNoTotal, NSNoSouls; the paper card shortens with it).
  function dropRow(cls, on) {
    if (ok(UI.labels)) UI.labels.SetHasClass(cls, on);
    for (const c of S.cols) if (ok(c.column)) c.column.SetHasClass(cls, on);
  }

  // final: the scan is done; a game with no souls by source at all (Street Brawl) then drops the row.
  function renderSouls(byHero, final = false) {
    let any = false;
    const shown = [];
    for (const c of S.cols) {
      const data = byHero.get(c.hero);
      if (!ok(c.souls)) continue;
      c.souls.RemoveClass("NSShow");
      c.souls.RemoveClass("NSStatic");
      c.souls.RemoveClass("NSSoulsFinal");
      fillSouls(c, data ? data.rows : []);
      if (!data) continue;
      any = true;
      shown.push(c.souls);
    }
    if (final) S.finalSouls = byHero;
    if (ok(UI.soulsLabel)) UI.soulsLabel.SetHasClass("NSEmpty", !any);
    dropRow("NSNoSouls", final && !any);
    trigger(shown, "NSShow");
  }

  // A column's top five sources as five pooled lines, made once and refilled (the stat timeline refills them
  // on every graph hover). NSR<i> staggers the arrival stroke (CSS); unused lines collapse.
  function fillSouls(c, rows) {
    if (!ok(c.souls)) return;
    if (!c.srcLines) {
      c.srcLines = [];
      for (let i = 0; i < 5; i++) {
        const line = $.CreatePanel("Panel", c.souls, "", { class: `NSSrc NSR${i}`, hittest: "false" });
        const bar = $.CreatePanel("Panel", line, "", { class: "NSSrcBar", hittest: "false" });
        const name = $.CreatePanel("Label", line, "", { class: "NSSrcName", text: "", hittest: "false" });
        const pct = $.CreatePanel("Label", line, "", { class: "NSSrcPct", text: "", hittest: "false" });
        c.srcLines.push({ line, bar, name, pct, key: "" });
      }
    }
    const top = (rows || []).slice().sort((a, b) => b.value - a.value).slice(0, 5);
    c.srcLines.forEach((l, i) => {
      const s = top[i];
      l.line.style.visibility = s ? "visible" : "collapse";
      if (!s) return;
      const [key, name] = SOURCES[s.name] || ["other", s.name];
      if (l.key !== key) {
        if (l.key) l.line.RemoveClass(`NSSrc_${l.key}`);
        l.line.AddClass(`NSSrc_${key}`);
        l.key = key;
      }
      l.bar.style.width = `${Math.max(0, Math.min(100, s.pct))}%`;
      setText(l.name, name);
      setText(l.pct, `${s.pct}%`);
    });
  }

  // ---------- soul lead graph ----------
  // User 2026-10-26: "reimagine the graph and don't make this bars". The lead (team 1 minus team 2) is one
  // smooth line on a UICanvas (client.dll 6819 ui_canvas.cpp, static RE: ClearJS(color) and
  // DrawSoftLinePointsJS(nPoints, [x0, y0, x1, y1, ...], thickness, softness, color); a colour that does not
  // parse draws white). The line is a monotone cubic through the scanned points, so it never swings past them;
  // amber above zero while team 1 leads, blue below, split exactly where the lead changes sides. Under it a
  // soft two-band area (one zig-zag polyline per band and run). Objective dots sit on the line in the
  // taker's colour with a hairline down to the stock icon; both peaks are labelled; the final lead is a pill
  // in the right gutter. Everything is drawn once per match; a clip wipes it in from the left.
  const PAD_Y = 12;
  const STEP_X = 3;
  const TEAM_RGB = ["E8920C", "4D7FE0"];
  // [outer, inner] area colours: the team colour mixed 18 % / 38 % into the plot's paper (#1A1813).
  const FILL_RGB = [["#3F2E12FF", "#684610FF"], ["#232A38FF", "#2D3F61FF"]];
  const LINE_RGB = ["FFB23A", "86A9FF"];
  const REVEAL_MS = 900;
  const graphX = (t, duration) => Math.max(0, Math.min(1, t / duration)) * CHART_W;
  // A tidy top for the scale (8 % headroom over the largest lead).
  function graphScale(maxAbs) {
    const unit = maxAbs > 20000 ? 5000 : maxAbs > 8000 ? 2000 : 1000;
    return Math.max(unit, Math.ceil(maxAbs * 1.08 / unit) * unit);
  }
  // Fritsch-Carlson monotone cubic through (xs, ys), xs strictly increasing: never overshoots a knot.
  function monotone(xs, ys) {
    const n = xs.length;
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      const h = xs[hi] - xs[lo];
      const t = (x - xs[lo]) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
    };
  }
  // Strokes are kept in S.graphDraws and painted by paint(), so the reveal can draw them up to an x.
  function stroke(points, thickness, softness, color) {
    if (points.length >= 4) S.graphDraws.push({ points, thickness, softness, color });
  }
  // Each stroke up to x = cutoff (a point past it is cut back to the cutoff on its segment).
  function paint(cutoff) {
    if (!ok(UI.canvas)) return;
    UI.canvas.ClearJS("#00000000");
    for (const d of S.graphDraws) {
      let pts = d.points;
      if (cutoff < CHART_W + 100) {
        pts = [];
        for (let i = 0; i < d.points.length; i += 2) {
          const x = d.points[i];
          const y = d.points[i + 1];
          if (x <= cutoff) { pts.push(x, y); continue; }
          const n = pts.length;
          if (n >= 2 && pts[n - 2] < cutoff) pts.push(cutoff, pts[n - 1] + (y - pts[n - 1]) * (cutoff - pts[n - 2]) / (x - pts[n - 2]));
          break;
        }
      }
      if (pts.length >= 4) UI.canvas.DrawSoftLinePointsJS(pts.length / 2, pts, d.thickness, d.softness, d.color);
    }
  }
  // [{ side: 0 | 1, pts: [[x, y], ...] }]: the line split where it crosses zero (side 0 = team 1 ahead).
  function leadRuns(samples, zero) {
    const runs = [];
    let run = null;
    for (const [x, y] of samples) {
      const side = y < zero - 1e-6 ? 0 : y > zero + 1e-6 ? 1 : -1;
      if (!run) { run = { side, pts: [[x, y]] }; continue; }
      if (side < 0 || side === run.side) { run.pts.push([x, y]); continue; }
      if (run.side < 0) { run.side = side; run.pts.push([x, y]); continue; }
      const [px, py] = run.pts[run.pts.length - 1];
      const cx = py === zero ? px : px + (zero - py) * (x - px) / (y - py);
      if (py !== zero) run.pts.push([cx, zero]);
      runs.push(run);
      run = { side, pts: [[cx, zero], [x, y]] };
    }
    if (run && run.side >= 0) runs.push(run);
    return runs;
  }
  function renderGraph(series, events, duration) {
    if (!ok(UI.graph) || !ok(UI.canvas)) return;
    const pts = series.filter((p) => p.t > 0 && p.t <= duration + 1).sort((p, q) => p.t - q.t);
    if (pts.length < 5 || duration <= 0) { UI.graph.RemoveClass("NSOn"); return; }
    const zero = GRAPH_H / 2;
    const half = zero - PAD_Y;
    const scale = graphScale(Math.max(1000, ...pts.map((p) => Math.abs(p.a - p.b))));
    const yOf = (lead) => zero - (lead / scale) * half;
    // Knots in pixels from the game start (lead 0); a repeated time keeps its last reading.
    const xs = [0];
    const ys = [zero];
    for (const p of pts) {
      const x = graphX(p.t, duration);
      if (x <= xs[xs.length - 1]) { if (x === xs[xs.length - 1] && xs.length > 1) ys[ys.length - 1] = yOf(p.a - p.b); continue; }
      xs.push(x);
      ys.push(yOf(p.a - p.b));
    }
    const curve = monotone(xs, ys);
    const endX = xs[xs.length - 1];
    const sampleXs = xs.slice();
    for (let x = STEP_X; x < endX; x += STEP_X) sampleXs.push(x);
    sampleXs.sort((a, b) => a - b);
    const samples = [];
    for (const x of sampleXs) if (!samples.length || x - samples[samples.length - 1][0] > 0.25 || xs.includes(x)) samples.push([x, curve(x)]);
    const runs = leadRuns(samples, zero);
    log(`graph: chart ${CHART_W}x${GRAPH_H}, zero ${zero}, half ${half}, scale ${scale}, ${xs.length - 1} points, ${runs.length} run(s)`);

    S.graphDraws = [];
    // The area: the team colour pre-mixed with the plot's dark paper, opaque (live: translucent strokes
    // stacked into stripes where neighbours overlap). Full height faint, the part nearest the line stronger.
    for (const run of runs) {
      const outer = [];
      const inner = [];
      run.pts.forEach(([x, y], i) => {
        const near = y + (zero - y) * 0.45;
        if (i % 2) { outer.push(x, y, x, zero); inner.push(x, y, x, near); } else { outer.push(x, zero, x, y); inner.push(x, near, x, y); }
      });
      stroke(outer, STEP_X + 0.6, 0.4, FILL_RGB[run.side][0]);
      stroke(inner, STEP_X + 0.6, 0.4, FILL_RGB[run.side][1]);
    }
    // Guides over the area: half and full scale, and one hairline per five minutes. Every hairline is HAIR
    // px: the UI scale at 900p is 0.83, so a 1 px stroke is 0.83 screen px and drops out or shows depending on
    // where it lands between pixels (live 2026-10-29: the 5:00 guide, a half-scale guide and most objective
    // drop lines were missing while their twins drew).
    for (const f of [-1, -0.5, 0.5, 1]) stroke([0, zero - f * half, CHART_W, zero - f * half], HAIR, 0.5, f === 0.5 || f === -0.5 ? "#FFEFD70A" : "#FFEFD712");
    for (let t = 300; t < duration; t += 300) stroke([graphX(t, duration), 2, graphX(t, duration), GRAPH_H - 2], HAIR, 0.5, "#FFEFD70A");
    // Objective hairlines from the line down to the icons.
    const objs = events.map((e) => { const x = graphX(e.t, duration); return { e, x, y: curve(Math.min(x, endX)) }; });
    for (const run of runs) {
      const flat = [];
      for (const [x, y] of run.pts) flat.push(x, y);
      stroke(flat, 9, 7, `#${TEAM_RGB[run.side]}48`);
      stroke(flat, 3, 1, `#${LINE_RGB[run.side]}FF`);
    }

    // Marks: objective dots, peaks, the line's end and the final lead.
    UI.marks.RemoveAndDeleteChildren();
    const dot = (cls, x, y, size) => {
      const ring = $.CreatePanel("Panel", UI.marks, "", { class: cls, hittest: "false" });
      ring.style.marginLeft = `${(x - size / 2).toFixed(1)}px`;
      ring.style.marginTop = `${(y - size / 2).toFixed(1)}px`;
      $.CreatePanel("Panel", ring, "", { class: "NSGraphDotCore", hittest: "false" });
      return ring;
    };
    for (const o of objs) dot(`NSGraphObj ${o.e.killer === 2 ? "NSObjTeam2" : "NSObjTeam1"}`, o.x, o.y, 10);
    const leads = pts.map((p) => ({ t: p.t, l: p.a - p.b }));
    [1, -1].forEach((sign, side) => {
      const label = UI.peaks[side];
      const best = leads.reduce((b, p) => (sign * p.l > sign * b.l ? p : b), { t: 0, l: 0 });
      // A peak at the line's end is the final lead's pill already.
      const atEnd = best.t === leads[leads.length - 1].t;
      const show = !atEnd && sign * best.l >= Math.max(1500, 0.06 * scale);
      if (ok(label)) label.SetHasClass("NSOn", show);
      if (!show || !ok(label)) return;
      const x = graphX(best.t, duration);
      const y = yOf(best.l);
      dot(`NSGraphPeakDot NSPeakDotTeam${side + 1}`, x, y, 10);
      setText(label, `PEAK +${fmtK(Math.abs(best.l))}   ${clock(best.t)}`);
      // Team 1 above its peak and team 2 below, unless that leaves the plot.
      let top = side === 0 ? y - 24 : y + 8;
      if (top < 2 || top > GRAPH_H - 18) top = side === 0 ? y + 8 : y - 24;
      label.style.marginLeft = `${Math.max(4, Math.min(CHART_W - 144, x - 70)).toFixed(1)}px`;
      label.style.marginTop = `${Math.max(2, Math.min(GRAPH_H - 18, top)).toFixed(1)}px`;
    });
    const last = leads[leads.length - 1];
    const lastY = ys[ys.length - 1];
    const lastSide = last.l < 0 ? 1 : 0;
    dot(`NSGraphEndDot NSPeakDotTeam${lastSide + 1}`, endX, lastY, 10);
    const pillY = Math.max(11, Math.min(GRAPH_H - 11, lastY));
    const tied = fmtK(Math.abs(last.l)) === "0.0K"; // a dead heat (under 50 souls apart, exactly 0 included): no leader, no end pill
    if (!tied) stroke([endX + 5, lastY, CHART_W + 8, pillY], HAIR, 0.5, `#${TEAM_RGB[lastSide]}70`);
    if (ok(UI.end)) {
      UI.end.style.visibility = tied ? "collapse" : "visible";
      setText(UI.end, `+${fmtK(Math.abs(last.l))}`);
      UI.end.SetHasClass("NSEndTeam1", lastSide === 0);
      UI.end.SetHasClass("NSEndTeam2", lastSide === 1);
      UI.end.style.marginLeft = `${CHART_W + 8}px`;
      UI.end.style.marginTop = `${(pillY - 11).toFixed(1)}px`;
    }
    S.graphScale = scale;
    S.graphYOf = yOf;
    S.leadAt = new Map(pts.map((p) => [p.t, p.a - p.b]));
    S.duration = duration;
    renderGraphCaptions();

    UI.ticks.RemoveAndDeleteChildren();
    for (let t = 0; t <= duration - 60; t += 300) {
      const tick = $.CreatePanel("Label", UI.ticks, "", { class: "NSTick", text: clock(t), hittest: "false" });
      tick.style.marginLeft = `${Math.max(0, Math.min(CHART_W - 60, graphX(t, duration) - 30)).toFixed(1)}px`;
    }
    const endTick = $.CreatePanel("Label", UI.ticks, "", { class: "NSTick NSTickEnd", text: clock(duration), hittest: "false" });
    endTick.style.marginLeft = `${CHART_W - 30}px`;
    UI.events.RemoveAndDeleteChildren();
    if (ok(UI.stems)) UI.stems.RemoveAndDeleteChildren();
    for (const o of objs) {
      const e = o.e;
      const cls = `NSEvent ${e.tier === "tier1" ? "NSEvTier1" : e.tier === "tier2" ? "NSEvTier2" : "NSEvBase"} ${e.killer === 2 ? "NSEvTeam2" : "NSEvTeam1"}`;
      const icon = $.CreatePanel("Panel", UI.events, "", { class: cls, hittest: "false" });
      const left = Math.max(0, Math.min(CHART_W - 26, o.x - (e.tier === "base" ? 13 : 11)));
      icon.AddClass(`NSW${Math.min(7, Math.floor(8 * left / CHART_W))}`);
      icon.style.marginLeft = `${left.toFixed(1)}px`;
      if (ok(UI.stems)) {
        const stem = $.CreatePanel("Panel", UI.stems, "", { class: `NSStem NSW${Math.min(7, Math.floor(8 * left / CHART_W))}`, hittest: "false" });
        const top = Math.min(STEM_END - 4, o.y + 7); // below the dot and the line's pen
        stem.style.marginLeft = `${(Math.max(1, Math.min(CHART_W - 1, o.x)) - HAIR / 2).toFixed(1)}px`;
        stem.style.marginTop = `${top.toFixed(1)}px`;
        stem.style.height = `${(STEM_END - top).toFixed(1)}px`;
      }
    }
    UI.graph.RemoveClass("NSShow");
    UI.graph.AddClass("NSOn");
    trigger([UI.graph], "NSShow");
    reveal();
  }
  // The stock team names from the header on each side's caption.
  function renderGraphCaptions() {
    if (!S.graphScale) return;
    const name = (i) => String(ok(UI.names[i]) ? UI.names[i].text || "" : "").toUpperCase();
    setText(UI.top, `${name(0)} AHEAD`);
    setText(UI.bottom, `${name(1)} AHEAD`);
    const scale = S.graphScale % 1000 ? fmtK(S.graphScale) : `${S.graphScale / 1000}K`;
    setText(UI.topScale, `+${scale}`);
    setText(UI.bottomScale, `+${scale}`);
  }
  // Draw the graph in from the left: the canvas strokes are repainted up to a growing x (a panel clip does
  // not reach a UICanvas, live 2026-10-26) and the dots and labels (#NSGraphDraw, over the plot, outside its torn mask) are wiped in with a stepped clip.
  function reveal() {
    if (!ok(UI.draw)) return;
    const token = ++S.revealToken;
    const t0 = Date.now();
    const step = () => {
      if (stopped || token !== S.revealToken || !ok(UI.draw)) return;
      const f = Math.min(1, (Date.now() - t0) / REVEAL_MS);
      const e = 1 - Math.pow(1 - f, 3);
      paint(f >= 1 ? Infinity : e * (CHART_W + 96));
      // Done: no clip at all. rect( 0%, 100%, 100%, 0% ) is the panel's own box and cut off the pill past the paper.
      UI.draw.style.clip = f >= 1 ? "none" : `rect( 0%, ${(e * 100).toFixed(2)}%, 100%, 0% )`;
      if (f < 1) $.Schedule(1 / 60, step);
    };
    paint(0);
    UI.draw.style.clip = "rect( 0%, 0%, 100%, 0% )";
    $.Schedule(1 / 60, step);
  }

  // ---------- show / teardown ----------

  // The entrance. Off the Scoreboard screen the board waits hidden: the frame without NSIntro (opacity 0),
  // the columns without NSIn (opacity 0), the stock items transparent. It plays when the screen is focused
  // and is re-armed only after the screen has been away INTRO_RESET_MS, so nothing on screen is ever hidden
  // to replay it (user 2026-10-26: the contents showed, vanished, then revealed).
  function playIntro() {
    S.introShown = true;
    S.introToken++;
    // Restart the souls and graph animations; their columns and frame are still hidden here.
    const souls = S.cols.map((c) => c.souls).filter((p) => ok(p) && p.GetChildCount() > 0);
    for (const p of souls) p.RemoveClass("NSShow");
    const graphOn = ok(UI.graph) && UI.graph.BHasClass("NSOn");
    if (graphOn) UI.graph.RemoveClass("NSShow");
    trigger([UI.frame], "NSIntro");
    trigger([UI.credit], "NSIntro");
    trigger(S.cols.map((c) => c.column), "NSIn");
    trigger(souls, "NSShow");
    if (graphOn) { trigger([UI.graph], "NSShow"); reveal(); }
    for (const c of S.cols) itemsShown(c, true);
  }

  function resetIntro() {
    S.introShown = false;
    S.introToken++;
    if (ok(UI.frame)) UI.frame.RemoveClass("NSIntro");
    if (ok(UI.credit)) UI.credit.RemoveClass("NSIntro");
    for (const c of S.cols) {
      if (ok(c.column)) c.column.RemoveClass("NSIn");
      itemsShown(c, false);
    }
  }

  function show(m) {
    UI.frame.AddClass("NSOn");
    if (ok(UI.credit)) UI.credit.AddClass("NSOn");
    S.introShown = false;
    if (UI.screen.BHasClass("Focused")) playIntro();
    for (const kid of UI.screen.Children()) {
      if (kid.id === "MatchID" || kid.BHasClass("MatchMode")) stockHide(kid);
    }
    // The mode label binds with the match details, which can land after the board shows.
    readMode();
    for (const s of [1.0, 3.0]) $.Schedule(s, readMode);
    log(`board shown: match ${m.id}, ${m.teams[0].rows.length}v${m.teams[1].rows.length}, ${clock(m.duration)}`);
    prefsLoad();
    // Stock shows the commend buttons only with .CanCommendPlayers (the viewer played this match).
    const canCommend = ok(UI.scoreboard) && (UI.scoreboard.BHasClass("CanCommendPlayers") || UI.scoreboard.BAscendantHasClass("CanCommendPlayers"));
    log(`commend: ${canCommend ? "offered" : "not offered (stock: only in a match you played)"}`);
  }

  // C++ reuses the stock rows when another match opens on the page (live: items changed under a
  // stale board), so the board deletes its own columns; the rows' inline styles stay valid.
  function teardown() {
    S.gen++;
    S.scanning = 0; // a scan of the old match never reports back, so it must not hold the retry
    if (S.hovered) unhover(); // a scan cut short leaves its hover open
    unhoverItems(HOVER.items);
    if (ok(UI.frame)) { UI.frame.RemoveClass("NSOn"); UI.frame.RemoveClass("NSIntro"); }
    creditSet(false, false);
    for (const c of S.cols) {
      if (ok(c.column)) c.column.DeleteAsync(0);
      css(c.items, { transitionDuration: "0s", opacity: "1" }); // the rows may stay stock
      slotsClear(c);
    }
    S.introShown = false;
    S.introToken++;
    S.cols = [];
    stockRestore();
    if (ok(UI.graph)) { UI.graph.RemoveClass("NSOn"); UI.graph.RemoveClass("NSShow"); }
    css(UI.graph, { marginTop: `${GRAPH_GAP_PX}px` });
    S.graphScale = 0;
    S.fitScale = 1;
    fitWrite(1);
    S.revealToken++;
    S.graphDraws = [];
    if (ok(UI.canvas)) UI.canvas.ClearJS("#00000000");
    if (ok(UI.marks)) UI.marks.RemoveAndDeleteChildren();
    timelineClear();
    S.walkers = null;
    S.flex = false;
    buyNote("");
  }

  function build(m) {
    teardown();
    renderHeader(m);
    layoutScoreboard();
    fitBoard();
    const anyWin = m.teams[0].win || m.teams[1].win;
    m.teams.forEach((t, i) => {
      t.rows.forEach((r, index) => decorateRow(r, i, index, anyWin && !t.win));
      hide(t.totals.row);
    });
    for (const c of S.cols) c.teamKills = m.teams[c.teamIndex].totals.value.kills;
    wireRows();
    paintCells(-1); // the picked rows (kept from the last match) and their labels
    // Every player on the same total souls (Street Brawl, user 2026-11-14): the row says nothing; drop it.
    const souls = m.teams.flatMap((t) => t.rows.map((r) => r.value.souls));
    const sameTotal = souls.length > 1 && souls.every((v) => v === souls[0]);
    dropRow("NSNoTotal", sameTotal);
    S.sameTotal = sameTotal;
    fitGraph();
    progress(SCAN_FROM, "BUILDING BOARD", "");
    renderSouls(new Map());
    show(m);
    logData("rows", m.teams.map((t) => ({ win: t.win, totals: t.totals.value, rows: t.rows.map((r) => ({ hero: r.hero, account: r.account, mvp: r.mvp, ...r.value })) })));
    scan(m);
  }



  // ---------- scan: stock graph tooltip and Lane Stats ----------

  function tooltip() {
    if (ok(UI.tip)) return UI.tip;
    const tip = windowRoot().FindChildTraverse(TIP_ID);
    UI.tip = ok(tip) ? tip : null;
    return UI.tip;
  }

  function tipTokens() {
    const tip = tooltip();
    if (!tip || !tip.visible) return [];
    const out = [];
    const walk = (p) => {
      if (!ok(p) || !p.visible) return;
      if (p.paneltype === "Label") {
        const t = String(p.text || "").replace(/\s+/g, " ").trim();
        if (t) out.push(t);
      }
      for (const kid of p.Children()) walk(kid);
    };
    walk(tip);
    return out;
  }

  // "27:51 | Troopers | 15,441 | (64%) | ... | 23,944" -> { time, rows: [{name, value, pct}], total }
  // allowEmpty: a column with nothing yet ("0:35 | 0": no damage at all) reads as no rows.
  function readTip(allowEmpty = false) {
    const tokens = tipTokens();
    if (!tokens.length) return null;
    const time = secs(tokens[0]);
    if (time < 0) return null;
    const rest = tokens.slice(1);
    let total = null;
    if (rest.length % 3 === 1) total = num(rest.pop());
    if (rest.length % 3 !== 0 || (rest.length === 0 && !allowEmpty)) return null;
    const rows = [];
    for (let i = 0; i < rest.length; i += 3) rows.push({ name: rest[i], value: num(rest[i + 1]), pct: num(rest[i + 2]) });
    return { time, rows, total, sig: tokens.join("|") };
  }

  // The general graphs (Souls Collected, Kills, Deaths, Healing) in player mode list every player in one
  // tooltip, largest first, a player at 0 left out, and name no one: each row is the stock PlayerRow
  // snippet (citadel_tooltip_graph_playernetworth.xml: .Row with #HeroImage and .ValueLabel), so the hero
  // comes from the row's hero image or, as live, its #ColorBar: the image has no heroid (live 2026-11-23, client
  // 6864, match 121685912, detailed_postgame/live/20261123-tooltip-rows-probe-6864.log), the bar's inline background-color is the
  // player's colour, the same as the graph button's #PlayerColor (colorHero: colour -> hero).
  // -> { time, rows: [{hero, value, color}], sig }; hero 0 when neither tells. Kills at 6:32 listed 7 of 12 players.
  function readTipHeroes(colorHero) {
    const tip = tooltip();
    if (!tip || !tip.visible) return null;
    let time = -1;
    const rows = [];
    const kidText = (p, cls) => {
      for (const kid of p.Children()) if (kid.BHasClass(cls)) return labelText(kid);
      return "";
    };
    const walk = (p) => {
      if (!ok(p) || !p.visible) return;
      if (p.BHasClass("Row")) {
        if (p.BHasClass("MatchTime")) time = secs(labelText(p));
        else if (!p.BHasClass("LabelRow")) {
          const image = p.FindChildTraverse("HeroImage");
          let hero = 0;
          try { hero = Number(image && image.heroid) || 0; } catch (e) { hero = 0; }
          const bar = p.FindChildTraverse("ColorBar");
          const color = ok(bar) ? String(bar.style.backgroundColor || "").toUpperCase() : "";
          if (!hero && colorHero) hero = colorHero.get(color) || 0;
          rows.push({ hero, value: num(kidText(p, "ValueLabel")), color });
        }
        return;
      }
      for (const kid of p.Children()) walk(kid);
    };
    walk(tip);
    if (time < 0) time = secs(tipTokens()[0] || ""); // the first label is the time either way
    if (time < 0) return null;
    return { time, rows, sig: `${time}|${rows.map((r) => `${r.hero}:${r.value}`).join("|")}` };
  }

  // A tooltip whose rows name no one (Damage from Players: one row per enemy hero) -> { time, rows: [], total, sig };
  // the last label is the total, a column with nothing yet ("0:35") reads 0.
  function readTipTotal() {
    const tokens = tipTokens();
    if (!tokens.length) return null;
    const time = secs(tokens[0]);
    if (time < 0) return null;
    return { time, rows: [], total: tokens.length > 1 ? num(tokens[tokens.length - 1]) : 0, sig: tokens.join("|") };
  }

  function columns() {
    const canvas = UI.graphs.FindChildTraverse("Graph");
    return ok(canvas) ? canvas.Children() : [];
  }

  // The stock tooltip (tooltip_base: .TooltipContainer opacity 0, .TooltipVisible opacity 1 with a 0.175 s
  // fade) is shown and hidden by its TooltipVisible class: the native column mouseover sets it synchronously
  // and the mouseout clears it, emitting the tooltip lifecycle events (client.dll 6821 0x181a9faf0,
  // 0x18232c8c0; .scratch/m1_research/notes.md). The board never writes the tooltip's opacity: an inline
  // opacity beats the class rule, and the old inline "1" on the Graphs screen kept the contents drawn after
  // the mouse left the graph (user report 2026-10-29). Each scan hover drops TooltipVisible in the same turn
  // (the rows stay readable, the fade never starts); the scan's last hover is closed by its stock onmouseout.
  const TIP_SHOWN = "TooltipVisible";
  function hideTip() {
    const tip = tooltip();
    if (tip && tip.BHasClass(TIP_SHOWN)) tip.RemoveClass(TIP_SHOWN);
  }
  // Ends the scan's synthetic hover the stock way (the column's own onmouseout), then makes sure.
  function unhover() {
    const col = S.hovered;
    S.hovered = null;
    try { if (ok(col)) $.DispatchEvent("DispatchPanelEvent", col, "onmouseout"); } catch (e) { /* hidden below */ }
    hideTip();
  }

  function hover(index) {
    const cols = columns();
    const col = cols[index < 0 ? cols.length + index : index];
    if (!ok(col)) return;
    $.DispatchEvent("DispatchPanelEvent", col, "onmouseover");
    S.hovered = col;
    hideTip(); // the first hover creates the tooltip
  }

  const graphType = (n) => {
    const dd = UI.graphs.FindChildTraverse("TypeDropDown");
    if (ok(dd)) dd.SetSelected(`type_${n}`);
  };
  const asTeam = (on) => $.DispatchEvent("CitadelGraphShowAsTeam", UI.graphs, on ? 1 : 0);
  const pick = (n) => $.DispatchEvent("CitadelMatchDetailsGraphClickPlayer", UI.graphs, n);

  // Runs jobs in order. Each job acts, then checks at once; a check that is not satisfied yet is
  // retried once per frame (the graph may redraw a frame later) and the act repeated every other
  // frame. Synchronous results chain within one frame, at most `budget` acts a frame (the stat timeline's
  // ~1,100 hovers would otherwise all land in one frame).
  function runJobs(gen, jobs, done, onStep, budget = Infinity) {
    const stats = { frames: 0, retries: 0, failed: 0, t0: Date.now() };
    let i = 0;
    const next = () => {
      let acts = 0;
      while (!stopped && gen === S.gen && i < jobs.length) {
        const job = jobs[i];
        if (onStep) onStep(i, jobs.length);
        if (job.skip && job.skip()) { i++; continue; }
        if (acts++ >= budget) {
          $.Schedule(0, () => { if (!stopped && gen === S.gen) { stats.frames++; next(); } });
          return;
        }
        try { job.act(); } catch (e) { logOnce(`act:${e}`, `scan act failed: ${e}`); }
        if (!attempt(job, 0)) return;
      }
      if (!stopped && gen === S.gen) done(stats);
    };
    // true = finished synchronously, keep looping; false = waiting on a frame.
    const attempt = (job, tries) => {
      let result = null;
      try { result = job.check(tries); } catch (e) { result = null; }
      if (result !== null) { job.take(result); i++; return true; }
      if (tries >= (job.max || FRAME_TRIES)) { stats.failed++; if (job.fail) job.fail(); i++; return true; }
      stats.retries++;
      $.Schedule(0, () => {
        if (stopped || gen !== S.gen) return;
        stats.frames++;
        if (tries % 2 === 1) { try { job.act(); } catch (e) { /* logged on first act */ } }
        if (attempt(job, tries + 1)) next();
      });
      return false;
    };
    next();
  }

  function heroOfButton(n) {
    const btn = UI.graphs.FindChildTraverse(`PlayerButton${n}`);
    let found = 0;
    const walk = (p, depth) => {
      if (found || !ok(p) || depth > 5) return;
      let h = 0;
      try { h = Number(p.heroid) || 0; } catch (e) { h = 0; }
      if (h > 0) { found = h; return; }
      for (const kid of p.Children()) walk(kid, depth + 1);
    };
    walk(btn, 0);
    return found;
  }

  // The stock Graphs page is viewer-relative, not team-number-ordered: left is the viewer's side (seen
  // 2026-11-13, client 6861: #TeamCtnLeft / #LeftPlayers held team 2 while the board's columns keep team 1
  // left). Heroes under a panel: every panel exposing a numeric heroid, same walk as heroOfButton.
  function heroesUnder(root) {
    const found = [];
    const walk = (p, depth) => {
      if (!ok(p) || depth > 6) return;
      let h = 0;
      try { h = Number(p.heroid) || 0; } catch (e) { h = 0; }
      if (h > 0) { found.push(h); return; }
      for (const kid of p.Children()) walk(kid, depth + 1);
    };
    walk(root, 0);
    return found;
  }

  // The one team (0/1) every hero belongs to in the match rows, else -1.
  function teamOfHeroes(m, heroes) {
    let team = -1;
    for (const h of heroes) {
      const of = [0, 1].filter((i) => m.teams[i].rows.some((r) => r.hero === h));
      if (of.length !== 1 || (team >= 0 && team !== of[0])) return -1;
      team = of[0];
    }
    return team;
  }

  // Which team is on the left of the Graphs page for the lane shown now (the picked button n):
  // (a) the lane's #LeftPlayers / #RightPlayers hero images, (b) else the picked button under
  // #TeamCtnLeft / #TeamCtnRight and its hero's team, (c) else -1: never a guess.
  function graphLeftTeam(m, n, buttonHero) {
    const lh = heroesUnder(UI.graphs.FindChildTraverse("LeftPlayers"));
    const rh = heroesUnder(UI.graphs.FindChildTraverse("RightPlayers"));
    const lt = teamOfHeroes(m, lh);
    const rt = teamOfHeroes(m, rh);
    if (lt >= 0 && (rt < 0 ? !rh.length : rt !== lt)) return { team: lt, how: "lane heroes", heroes: lh };
    if (lt < 0 && rt >= 0 && !lh.length) return { team: 1 - rt, how: "lane heroes", heroes: m.teams[1 - rt].rows.map((r) => r.hero) };
    let side = "";
    for (let p = UI.graphs.FindChildTraverse(`PlayerButton${n}`), d = 0; ok(p) && !side && d < 8; p = p.GetParent(), d++) {
      if (p.id === "TeamCtnLeft") side = "left";
      else if (p.id === "TeamCtnRight") side = "right";
    }
    const bt = teamOfHeroes(m, buttonHero[n] ? [buttonHero[n]] : []);
    if (side && bt >= 0) {
      const team = side === "left" ? bt : 1 - bt;
      return { team, how: "picked button", heroes: m.teams[team].rows.map((r) => r.hero) };
    }
    return { team: -1, how: `none (lane heroes ${lh.join(",") || "-"}|${rh.join(",") || "-"}, button ${n} hero ${buttonHero[n] || 0} ${side || "in no team container"})`, heroes: lh };
  }

  function laneSig() {
    const parts = [];
    for (const [id] of LANE_TIERS.concat([["LaneStatKills"], ["LaneStatNetWorth"]])) {
      const panel = UI.graphs.FindChildTraverse(id);
      if (!ok(panel)) return null;
      const labels = [];
      const walk = (p) => { if (!ok(p)) return; if (p.paneltype === "Label") labels.push(String(p.text || "").trim()); for (const k of p.Children()) walk(k); };
      walk(panel);
      parts.push(labels);
    }
    return parts;
  }

  // The next game in the same private lobby (user 2026-11-06: souls by source, the lead graph and the
  // objectives showed for the first game only): the page and its rows are reused, and the stock Graphs data
  // can come after the rows, so a scan may find no graph or the last match's. The lead check names the
  // tooltip rows only against this match's totals, so such a scan reads no lead; the 1 s safety check
  // (step) runs it again, up to SCAN_RETRIES times (no timers of its own). Lane Stats has no such check:
  // without a lead read, its times are not trusted.
  const SCAN_RETRIES = 8;
  function retryScan(m, gen, attempt, why) {
    if (attempt >= SCAN_RETRIES) return false;
    log(`scan: ${why}; again on the next check (${attempt + 1}/${SCAN_RETRIES})`);
    S.rescan = { m, gen, attempt: attempt + 1, at: Date.now() + 1000 }; // bursts check every 0.1 s: wait 1 s
    return true;
  }

  function scan(m, attempt = 0) {
    const gen = S.gen;
    const canvas = UI.graphs ? UI.graphs.FindChildTraverse("Graph") : null;
    const count = ok(canvas) ? canvas.GetChildCount() : 0;
    if (!count) {
      if (!retryScan(m, gen, attempt, "no graph columns")) { log("scan: no graph columns"); progressDone(); paintCells(S.hoverCol); scanItemNames(gen); }
      return;
    }
    S.scanning = gen;
    const totals = [m.teams[0].totals.value.souls, m.teams[1].totals.value.souls];
    const series = [];
    const souls = new Map();
    const events = [];
    const lanes = [];
    let teamNames = null; // tooltip row name -> team index, from the last column's exact totals
    let rowsNamed = false; // false: tied totals and no stock team name told the tooltip rows apart
    let prevSig = "";
    let lastPoint = null;
    const times = new Array(count).fill(-1); // each graph column's time (s), for the stat timeline
    const jobs = [];
    const setup = (fn) => ({ act: fn, check: () => true, take: () => {} });

    // 1. Soul lead: Souls Collected, team mode, last column first (its values equal the totals rows,
    //    which names the two tooltip rows), then the other columns left to right.
    const teamJob = (index) => ({
      act: () => hover(index),
      check: () => {
        const tip = readTip();
        if (!tip || tip.rows.length !== 2 || tip.sig === prevSig) return null;
        if (!teamNames) {
          // The last column's values equal the totals rows, give or take a few souls (live, demo
          // 121685912: 171,451 in the graph against a totals row of 171,452), so the closer pairing names
          // the two tooltip rows.
          const [r0, r1] = tip.rows;
          const keep = Math.abs(r0.value - totals[0]) + Math.abs(r1.value - totals[1]);
          const swap = Math.abs(r0.value - totals[1]) + Math.abs(r1.value - totals[0]);
          const tolerance = Math.max(50, 0.005 * (totals[0] + totals[1]));
          if (r0.name === r1.name || Math.min(keep, swap) > tolerance) return null;
          if (keep !== swap) {
            teamNames = keep < swap ? new Map([[r0.name, 0], [r1.name, 1]]) : new Map([[r0.name, 1], [r1.name, 0]]);
            rowsNamed = true;
          } else {
            // Tied totals cannot name the rows (Street Brawl, match 136872372: all 8 players end on 22,400,
            // so the scan read no lead and retried 8 times; user report 2026-11-13). The graph is still this
            // match's. The stock team names can name the rows; else the order stays unknown and the lead is
            // drawn only when it is 0 at every column (the order then changes nothing).
            const stock = [0, 1].map((i) => String($.Localize(`#Citadel_Team${i + 1}_Name`)).toUpperCase());
            const i0 = stock.indexOf(String(r0.name).toUpperCase());
            const i1 = stock.indexOf(String(r1.name).toUpperCase());
            rowsNamed = i0 >= 0 && i1 >= 0 && i0 !== i1;
            teamNames = rowsNamed ? new Map([[r0.name, i0], [r1.name, i1]]) : new Map([[r0.name, 0], [r1.name, 1]]);
          }
        }
        if (!teamNames.has(tip.rows[0].name) || !teamNames.has(tip.rows[1].name)) return null;
        return tip;
      },
      take: (tip) => {
        prevSig = tip.sig;
        const v = [0, 0];
        for (const r of tip.rows) v[teamNames.get(r.name)] = r.value;
        const point = { t: tip.time, a: v[0], b: v[1] };
        times[index < 0 ? count - 1 : index] = tip.time;
        if (index < 0) lastPoint = point;
        else series.push(point);
      },
      fail: () => logOnce(`team:${index}`, `scan: team column ${index} unread (${tipTokens().join("|").slice(0, 120)})`)
    });
    jobs.push(setup(() => { graphType(0); asTeam(true); }));
    jobs.push(teamJob(-1));
    for (let c = 0; c < count - 1; c++) jobs.push(teamJob(c));
    jobs.push(setup(() => { if (lastPoint) series.push(lastPoint); }));

    // 2. Which player each graph button is: the button's hero image when it exposes one, else the
    //    button's own Souls Collected at the end, which equals exactly one row's net worth.
    const lastTime = () => (lastPoint ? lastPoint.t : m.duration);
    const buttonHero = Array.from({ length: 13 }, (_, n) => (n ? heroOfButton(n) : 0));
    const rows = m.teams[0].rows.concat(m.teams[1].rows);
    const buttons = Math.min(12, rows.length); // graph buttons that exist: one per player
    const playerTip = (tries, wantTeamRows) => {
      const tip = readTip();
      if (!tip || tip.time !== lastTime()) return null;
      if (teamNames && tip.rows.some((r) => teamNames.has(r.name)) !== wantTeamRows) return null;
      if (tip.sig === prevSig && tries < 4) return null;
      return tip;
    };
    if (buttonHero.slice(1, buttons + 1).some((h) => !h)) {
      jobs.push(setup(() => { graphType(0); asTeam(false); }));
      for (let n = 1; n <= buttons; n++) {
        jobs.push({
          skip: () => buttonHero[n] > 0,
          act: () => { pick(n); hover(-1); },
          check: (tries) => {
            const tip = playerTip(tries, false);
            return tip && tip.rows.length === 1 ? tip : null;
          },
          take: (tip) => {
            prevSig = tip.sig;
            const match = rows.filter((r) => r.value.souls === tip.rows[0].value);
            if (match.length === 1) buttonHero[n] = match[0].hero;
          },
          fail: () => logOnce(`map:${n}`, `scan: button ${n} unmapped (${tipTokens().join("|").slice(0, 120)})`)
        });
      }
    }

    // 3. Souls by source per player, at the last column.
    jobs.push(setup(() => { graphType(graphTypeId(TL_SOURCES)); asTeam(false); })); // by its label, as the timeline
    for (let n = 1; n <= buttons; n++) {
      jobs.push({
        skip: () => !buttonHero[n],
        act: () => { pick(n); hover(-1); },
        check: (tries) => playerTip(tries, false),
        take: (tip) => { prevSig = tip.sig; souls.set(buttonHero[n], tip); },
        fail: () => logOnce(`souls:${n}`, `scan: souls for button ${n} (hero ${buttonHero[n]}) unread`)
      });
    }

    // 4. Lane Stats: objective destroy times, both teams, one lane per pick until three lanes. The
    //    panel is read a frame after the pick so a stale lane is never taken for a new one.
    let prevLane = "";
    jobs.push(setup(() => graphType(12)));
    for (let n = 1; n <= buttons; n++) {
      jobs.push({
        skip: () => lanes.length >= 3,
        act: () => pick(n),
        check: (tries) => {
          if (tries === 0) return null;
          const sig = laneSig();
          if (!sig) return null;
          const flat = JSON.stringify(sig);
          if (flat === prevLane && tries < 3) return null;
          return { sig, flat };
        },
        take: ({ sig, flat }) => {
          prevLane = flat;
          if (!lanes.some((l) => l.flat === flat)) lanes.push({ flat, sig, button: n, side: graphLeftTeam(m, n, buttonHero) });
        }
      });
    }

    // 5. Put the stock graph back the way it opens.
    jobs.push(setup(() => { graphType(0); asTeam(true); }));

    log(`scan: ${jobs.length} steps, ${count} columns, button heroes ${buttonHero.slice(1).join(",")}`);
    runJobs(gen, jobs, (stats) => {
      S.scanning = 0;
      unhover();
      // No last column matched this match's totals: the graph is missing or still the last match's.
      if (!lastPoint && retryScan(m, gen, attempt, "the graph is not this match's yet")) return;
      // Nothing read from such a graph is trusted: no objectives and no souls by source.
      if (!lastPoint) {
        lanes.length = 0;
        souls.clear();
      }
      if (lastPoint && !rowsNamed && series.some((p) => p.a !== p.b)) {
        log(`scan: tied totals and tooltip rows ${Array.from(teamNames.keys()).join("|")} not the stock team names: the lead is not drawn`);
        series.length = 0;
      }
      for (const lane of lanes) {
        const side = lane.side;
        if (side.team < 0) {
          log(`scan: lane ${lane.button}: left team unknown, objectives dropped: ${side.how}`);
          continue;
        }
        log(`scan: lane ${lane.button}: left team ${side.team + 1} by ${side.how}, left heroes ${side.heroes.join(",")}`);
        LANE_TIERS.forEach(([, tier], i) => {
          const labels = lane.sig[i];
          // [left team's structure, tier name, right team's structure]: a time on the left is the LEFT
          // team's structure falling, so the right team took it. Which team is left is read per lane
          // (graphLeftTeam): the page is viewer-relative, not team 1 left (seen 2026-11-13, client 6861;
          // the same scan order gave the mirror of the 2026-10-29 log).
          const owner = side.team + 1;
          const killer = 3 - owner;
          const left = secs(labels[0]);
          const right = secs(labels[labels.length - 1]);
          if (left >= 0) events.push({ t: left, tier, owner, killer });
          if (right >= 0) events.push({ t: right, tier, owner: killer, killer: owner });
        });
      }
      events.sort((a, b) => a.t - b.t);
      log(`scan done in ${Date.now() - stats.t0} ms, ${stats.frames} frames, ${stats.retries} retries, ${stats.failed} failed: ${series.length} lead points, ${souls.size} souls, ${lanes.length} lanes, ${events.length} objectives`);
      logData("series", series);
      logData("souls", Array.from(souls, ([hero, tip]) => ({ hero, total: tip.total, rows: tip.rows })));
      logData("events", events);
      // Walkers (lane tier 2) each team killed, for the extra slots (checkFlex); only from this match's graph.
      S.walkers = lastPoint && lanes.length ? [1, 2].map((team) => events.filter((e) => e.tier === "tier2" && e.killer === team).map((e) => e.t).sort((a, b) => a - b)) : null;
      renderSouls(souls, true);
      renderGraph(series, events, m.duration);
      progressDone();
      // The stat timeline reads the same columns per player once the board is drawn (only for this match's graph).
      if (lastPoint && S.graphScale) scanTimeline(m, gen, times, buttonHero, souls);
      if (!S.scanning && !S.rescan) {
        paintCells(S.hoverCol); // no timeline coming: its rows say so ("-")
        scanItemNames(gen); // no timeline coming: the item hovers may start
      }
    }, (i, total) => progress(SCAN_FROM + (1 - SCAN_FROM) * (i / total), "READING GRAPHS", `${i + 1} / ${total}`));
  }

  // ---------- stat timeline: the board's numbers at a graph column ----------
  // User 2026-11-23: hovering the soul lead graph shows every player's numbers at that moment (souls, kills,
  // deaths, player and objective damage, healing, souls by source) and the header's team totals and clock;
  // leaving the graph brings the final numbers back. The stock graphs sample a match in 40 even columns
  // (121685912, 23:47: one every ~36 s), so the hover snaps to those columns and never makes up a value in
  // between. What each stock graph gives (probe, live 2026-11-23, client 6864, detailed_postgame/live/20261123-graph-probe-6864.log):
  //   Souls Collected, Kills, Deaths, Healing - player mode: every player in one tooltip, named by colour
  //     (readTipHeroes);
  //   Damage Breakdown, per picked player - "Enemy Players" = player damage, "Objectives" = objective damage
  //     (both equal the scoreboard at the last column);
  //   Souls by Source, per picked player.
  // Healing by Type is not used: its total was another number than the player's healing for some players
  // (hero 84: 5,349 against 865; verify-timeline-live.js, 2026-11-23).
  // Assists have no stock graph: their cells keep the final number, dimmed, while the mouse is on the graph.
  // The Healing graph leaves out the barrier the scoreboard adds (hero 87: 22,671 healing + 1,214 barrier =
  // 23,885), so while hovering the healing row is the graph's at every column, the last one included, and its
  // label says so; every other stat's last column is the scoreboard's exact final number.
  const TL_KEYS = ["souls", "kills", "deaths", "pdmg", "odmg", "heal"];
  // [key, graph type label token, English label, the type id seen live (6864)]
  const TL_GENERAL = [
    ["souls", "#Citadel_GraphType_NetWorth", "Souls Collected", 0],
    ["kills", "#Citadel_GraphType_Kills", "Kills", 1],
    ["deaths", "#Citadel_GraphType_Deaths", "Deaths", 2],
    ["heal", "#Citadel_GraphType_Healing", "Healing", 6]
  ];
  const TL_SOURCES = ["#Citadel_GraphType_SoulsBySource", "Souls by Source", 4];
  const TL_DAMAGE = ["#Citadel_GraphType_DamageBreakdown", "Damage Breakdown", 5];
  const TL_DTYPE = ["#Citadel_GraphType_DamageType", "Damage Dealt by Type", 7];
  const TL_TAKEN = ["#Citadel_GraphType_DamageTaken", "Damage from Players", 11];
  const TL_BUDGET = 24; // timeline hovers a frame (~2,100 in all for 12 players and 40 columns)
  const RESTORE_S = 0.05; // the mouse left a strip: the final numbers come back unless it entered another
  const loc = (token, english) => {
    const s = String($.Localize(token) || "");
    return s && !s.startsWith("#") ? s : english;
  };
  // 22095 written like the scoreboard's own text for that cell ("22,095").
  const fmtLike = (text, v) => {
    const sep = /\d([^\d])\d{3}(?!\d)/.exec(String(text || ""));
    return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, sep ? sep[1] : ",");
  };

  // A graph type's id by its dropdown label (the ids are the engine's and may move), else the id seen live.
  function graphTypeId([token, english, fallback]) {
    const want = loc(token, english).toUpperCase();
    try {
      const dd = UI.graphs.FindChildTraverse("TypeDropDown");
      const menu = ok(dd) && typeof dd.AccessDropDownMenu === "function" ? dd.AccessDropDownMenu() : null;
      if (ok(menu)) {
        for (const o of menu.Children()) {
          const id = /^type_(\d+)$/.exec(String(o.id || ""));
          if (id && labelText(o).toUpperCase() === want) return Number(id[1]);
        }
      }
    } catch (e) { /* no menu: the live id */ }
    return fallback;
  }

  // Players who share a colour ("twins"; live 6864, match 121685912: heroes 86 and 87, 18 and 84) give the
  // general graphs' rows of that colour unnamed. Their values per column are put back on the players from the
  // last column (the scoreboard) towards the first: every value is a running total, so no player's value may
  // be above their next column's; of the orders left, the one whose steps best follow the players' own
  // (per-player) growth is taken: Souls by Source totals for souls, its Enemy Kills souls for kills. Deaths
  // have no per-player graph: two twins on the same total at the next column may then be swapped (logged as
  // ordered by growth); their values together are always the graph's.
  // values: [n] -> sorted values of the group at that column (null: unread); end: the group's final values per
  // hero; guide(h, c) -> a per-player measure that grows like this stat, or null. -> { at: hero -> [n], guessed }.
  // slack: how far a graph value may sit above the next column's (souls: the graph against the scoreboard).
  function untwin(group, values, end, guide, slack = 0) {
    const n = values.length;
    const at = new Map(group.map((h) => [h, new Array(n).fill(null)]));
    for (const h of group) at.get(h)[n - 1] = end.get(h);
    let guessed = 0;
    const perms = (list) => (list.length <= 1 ? [list] : list.flatMap((x, i) => perms(list.slice(0, i).concat(list.slice(i + 1))).map((p) => [x].concat(p))));
    for (let c = n - 2; c >= 0; c--) {
      const vals = values[c];
      if (!vals || group.some((h) => at.get(h)[c + 1] === null)) continue;
      const next = (h) => at.get(h)[c + 1];
      const orders = (group.length <= 4 ? perms(vals) : [vals]).filter((p) => group.every((h, i) => p[i] <= next(h) + slack));
      if (!orders.length) continue;
      // Squared distance of each step from the player's own growth; a rank swap against the next column
      // only breaks a tie (no guide, equal steps: the order of the next column is kept).
      // The guide's steps scaled to this column's total step (kill souls against kills), when every twin has one.
      const steps = group.map((h) => { const g0 = guide(h, c); const g1 = guide(h, c + 1); return g0 !== null && g1 !== null ? g1 - g0 : null; });
      const guideSum = steps.every((x) => x !== null) ? steps.reduce((s, x) => s + x, 0) : 0;
      const scale = guideSum > 0 ? (group.reduce((s, h) => s + next(h), 0) - vals.reduce((s, x) => s + x, 0)) / guideSum : 0;
      const cost = (p) => group.reduce((s, h, i) => {
        const want = scale ? steps[i] * scale : 0;
        let swaps = 0;
        group.forEach((h2, k) => { if (k > i && (p[i] - p[k]) * (next(h) - next(h2)) < 0) swaps++; });
        return s + Math.pow(next(h) - p[i] - want, 2) + 1e-6 * swaps;
      }, 0);
      const costs = orders.map(cost);
      const best = costs.indexOf(Math.min(...costs));
      if (new Set(orders.map((p) => p.join(","))).size > 1) guessed++;
      group.forEach((h, i) => { at.get(h)[c] = orders[best][i]; });
    }
    return { at, guessed };
  }

  // Reads every column of the general graphs (all players at once) and of the per-player graphs (one pick per
  // player), after the main scan. Each graph is first checked at its last column against what it must show
  // (the scoreboard's numbers, or the main scan's souls by source), so a switch that lands a frame late is
  // never read as the new graph; a graph that never matches is left out and its cells stay final.
  function scanTimeline(m, gen, times, buttonHero, finalSouls) {
    const n = times.length;
    const rows = m.teams[0].rows.concat(m.teams[1].rows);
    const heroes = rows.map((r) => r.hero);
    if (n < 2 || times.some((t) => t < 0) || new Set(heroes).size !== heroes.length) {
      log(`timeline: not read (${n} columns, ${times.filter((t) => t < 0).length} without a time, ${heroes.length} players, ${new Set(heroes).size} heroes)`);
      return;
    }
    const final = new Map(rows.map((r) => [r.hero, r.value]));
    // Player colour -> heroes, from the graph buttons (#PlayerColor's inline colour, the button's hero badge).
    const byColor = new Map();
    const noColor = [];
    for (let b = 1; b <= 12; b++) {
      const button = UI.graphs.FindChildTraverse(`PlayerButton${b}`);
      if (!ok(button)) continue;
      const swatch = button.FindChildTraverse("PlayerColor");
      const color = ok(swatch) ? String(swatch.style.backgroundColor || "").toUpperCase() : "";
      if (color && final.has(buttonHero[b])) byColor.set(color, (byColor.get(color) || []).concat([buttonHero[b]]));
      else noColor.push(b);
    }
    const colorHero = new Map(Array.from(byColor).filter(([, hs]) => hs.length === 1).map(([color, hs]) => [color, hs[0]]));
    const twins = Array.from(byColor).filter(([, hs]) => hs.length > 1); // [colour, heroes]
    const by = new Map(heroes.map((h) => {
      const p = { src: new Array(n).fill(null), dtype: new Array(n).fill(null), taken: new Array(n).fill(null) };
      for (const k of TL_KEYS) p[k] = new Array(n).fill(null);
      return [h, p];
    }));
    // key -> colour -> [n] sorted values of that colour's players (twins only)
    const twinVals = new Map(TL_GENERAL.map(([key]) => [key, new Map(twins.map(([color]) => [color, new Array(n).fill(null)]))]));
    const last = n - 1;
    const ready = new Set();
    const failed = [];
    const endSigs = []; // each checked graph's last-column tooltip: a later graph's must differ
    const jobs = [];
    const setup = (fn) => ({ act: fn, check: () => true, take: () => {} });
    const twinOf = new Map(twins); // colour -> its heroes
    const isTwin = new Set(twins.flatMap(([, hs]) => hs));
    const known = (tip) => tip.rows.every((r) => final.has(r.hero) || twinOf.has(r.color));
    const valueOf = (tip, h) => { const r = tip.rows.find((x) => x.hero === h); return r ? r.value : 0; };
    // A twin colour's values, largest first, padded with 0 for its players the tooltip left out.
    const twinValues = (tip, color) => {
      const vals = tip.rows.filter((r) => !r.hero && r.color === color).map((r) => r.value);
      while (vals.length < twinOf.get(color).length) vals.push(0);
      return vals.sort((a, b) => b - a);
    };
    const near = (v, want) => Math.abs(v - want) <= Math.max(50, 0.005 * want); // the graph can be a few souls off
    const same = { souls: near, kills: (v, w) => v === w, deaths: (v, w) => v === w };
    // The last column against the scoreboard: named players one by one, twins as a set. Healing has no exact
    // match (the scoreboard adds barrier): a tooltip no earlier graph showed, a frame after the switch.
    const atEnd = (key, tip, tries) => (key === "heal" ? tries >= 1 && !endSigs.includes(tip.sig) :
      heroes.every((h) => isTwin.has(h) || same[key](valueOf(tip, h), final.get(h)[key])) &&
      twins.every(([color, hs]) => {
        const want = hs.map((h) => final.get(h)[key]).sort((a, b) => b - a);
        return twinValues(tip, color).every((v, i) => same[key](v, want[i]));
      }));
    const unread = (tag) => {
      failed.push(tag);
      const tip = readTipHeroes(colorHero);
      logOnce(`tl:${tag}`, `timeline: ${tag} unread (${tipTokens().join("|").slice(0, 160)}${tip ? ` rows ${tip.rows.map((r) => `${r.hero}${r.color}`).join(",")}` : ""})`);
    };

    for (const [key, ...type] of TL_GENERAL) {
      const id = graphTypeId(type);
      jobs.push(setup(() => { graphType(id); asTeam(false); }));
      jobs.push({
        act: () => hover(-1),
        check: (tries) => {
          const tip = readTipHeroes(colorHero);
          return tip && tip.time === times[last] && known(tip) && atEnd(key, tip, tries) ? tip : null;
        },
        take: (tip) => {
          endSigs.push(tip.sig);
          ready.add(key);
          for (const [color] of twins) twinVals.get(key).get(color)[last] = twinValues(tip, color);
          // Healing keeps the graph's own last column (no barrier, like every other column of it); twins' in untwin.
          if (key === "heal") for (const h of heroes) if (!isTwin.has(h)) by.get(h).heal[last] = valueOf(tip, h);
        },
        fail: () => unread(key)
      });
      for (let c = 0; c < last; c++) {
        jobs.push({
          skip: () => !ready.has(key),
          act: () => hover(c),
          check: () => {
            const tip = readTipHeroes(colorHero);
            return tip && tip.time === times[c] && known(tip) ? tip : null;
          },
          take: (tip) => {
            for (const h of heroes) if (!isTwin.has(h)) by.get(h)[key][c] = valueOf(tip, h);
            for (const [color] of twins) twinVals.get(key).get(color)[c] = twinValues(tip, color);
          },
          fail: () => unread(`${key}@${c}`)
        });
      }
    }

    // One pick per graph button (buttonHero: the main scan's button -> hero), its last column checked first.
    const buttons = Math.min(12, rows.length);
    // The pick is asserted again with every column, and must still hold at the end (the last column's tooltip
    // as checked first, every column's total never below the one before): live 2026-11-23 the last columns of
    // one pick read another player's (hero 12's damage turned into hero 86's at 20:12). A player that drifts is
    // read once more, then left out (final, dimmed).
    // read: the tooltip reader (readTip; Damage from Players rows name no one: readTipTotal).
    const perPlayer = (name, type, check, take, total, clear, read = () => readTip(true)) => {
      const id = graphTypeId(type);
      jobs.push(setup(() => { graphType(id); asTeam(false); }));
      for (let b = 1; b <= buttons; b++) {
        const hero = buttonHero[b];
        if (!final.has(hero)) continue;
        const tag = `${name}:${b}`;
        const round = (attempt) => {
          let endSig = "";
          let prev = -1;
          let drift = "";
          const list = [{
            act: () => { pick(b); hover(-1); },
            check: (tries) => {
              if (tries) hover(-1); // a tooltip made now, after a pick that landed late
              const tip = read();
              return tip && tip.time === times[last] && check(tip, hero, tries) ? tip : null;
            },
            take: (tip) => { endSig = tip.sig; endSigs.push(tip.sig); ready.add(tag); take(by.get(hero), last, tip); },
            fail: () => unread(tag)
          }];
          for (let c = 0; c < last; c++) {
            list.push({
              skip: () => !ready.has(tag) || !!drift,
              act: () => { pick(b); hover(c); },
              check: () => {
                const tip = read();
                return tip && tip.time === times[c] ? tip : null;
              },
              take: (tip) => {
                const v = total(tip);
                if (v < prev) { drift = `${times[c]} s: ${prev} -> ${v}`; return; }
                prev = v;
                take(by.get(hero), c, tip);
              },
              fail: () => unread(`${tag}@${c}`)
            });
          }
          const confirm = {
            skip: () => !ready.has(tag),
            act: () => { pick(b); hover(-1); },
            check: () => {
              const tip = read();
              return tip && tip.time === times[last] ? tip : null;
            },
            take: (tip) => {
              if (!drift && tip.sig !== endSig) drift = "the last column changed";
              if (!drift) return;
              ready.delete(tag);
              if (attempt < 1) {
                log(`timeline: ${tag} (hero ${hero}) drifted (${drift}); read again`);
                jobs.splice(jobs.indexOf(confirm) + 1, 0, ...round(attempt + 1));
              } else {
                failed.push(`${tag} drifted`);
                logOnce(`tl:${tag}:drift`, `timeline: ${tag} (hero ${hero}) drifted again (${drift}); left out`);
                clear(by.get(hero));
              }
            },
            fail: () => unread(`${tag}@end`)
          };
          list.push(confirm);
          return list;
        };
        jobs.push(...round(0));
      }
    };
    // No exact match at the end: a tooltip no earlier graph or pick showed (a pick that has not landed yet
    // still shows the last player's), or the same one after a few frames (two players with the same numbers).
    const fresh = (tip, tries) => !endSigs.includes(tip.sig) || tries >= 6;
    const sum = (tip) => (tip.total !== null ? tip.total : tip.rows.reduce((s, r) => s + r.value, 0));
    perPlayer("src", TL_SOURCES, (tip, hero, tries) => {
      const want = finalSouls.get(hero);
      return want ? tip.sig === want.sig : fresh(tip, tries);
    }, (p, c, tip) => { p.src[c] = tip.rows; }, sum, (p) => p.src.fill(null));
    const PLAYERS = loc("#Citadel_Graph_Damage_Player", "Enemy Players");
    const BOSS = loc("#Citadel_Graph_Damage_Boss", "Objectives");
    const dmg = (tip, label) => { const r = tip.rows.find((x) => x.name === label); return r ? r.value : 0; };
    perPlayer("dmg", TL_DAMAGE, (tip, hero) => dmg(tip, PLAYERS) === final.get(hero).pdmg && dmg(tip, BOSS) === final.get(hero).odmg,
      (p, c, tip) => { p.pdmg[c] = dmg(tip, PLAYERS); p.odmg[c] = dmg(tip, BOSS); }, sum, (p) => { p.pdmg.fill(null); p.odmg.fill(null); });
    // Damage Dealt by Type (DAMAGE TYPES): its total is the player damage, exactly.
    perPlayer("dtype", TL_DTYPE, (tip, hero) => sum(tip) === final.get(hero).pdmg, (p, c, tip) => { p.dtype[c] = tip.rows; }, sum,
      (p) => p.dtype.fill(null));
    // Damage from Players (COMBAT): one nameless row per enemy hero; the total is what the player took from them.
    perPlayer("taken", TL_TAKEN, (tip, hero, tries) => fresh(tip, tries), (p, c, tip) => { p.taken[c] = tip.total; }, (tip) => tip.total,
      (p) => p.taken.fill(null), readTipTotal);

    // Put the stock graph back the way it opens.
    jobs.push(setup(() => { graphType(0); asTeam(true); }));

    S.scanning = gen;
    log(`timeline: ${jobs.length} steps, ${n} columns, ${heroes.length} players, ${colorHero.size} player colours` +
      `${twins.length ? `, shared by ${twins.map(([, hs]) => hs.join("+")).join(" ")}` : ""}${noColor.length ? `, none on button ${noColor.join(",")}` : ""}`);
    runJobs(gen, jobs, (stats) => {
      S.scanning = 0;
      unhover();
      // The last column is the scoreboard's final numbers, exactly; healing the graph's when it was read (the
      // scoreboard adds barrier, which no graph has over time).
      for (const h of heroes) {
        const p = by.get(h);
        for (const k of TL_KEYS) if (k !== "heal" || !ready.has("heal")) p[k][last] = final.get(h)[k];
        const end = finalSouls.get(h);
        if (end) p.src[last] = end.rows;
      }
      // A player's Souls by Source at column c, all of it or one source (null: not read).
      const srcOf = (h, c, name = "") => {
        const src = by.get(h).src[c];
        return src ? src.filter((r) => !name || r.name === name).reduce((s, r) => s + r.value, 0) : null;
      };
      // Twins: their general values put back on each player (untwin). Guides: souls follow the player's Souls by
      // Source total, kills its Enemy Kills souls; deaths and healing have none.
      const guides = { souls: (h, c) => srcOf(h, c), kills: (h, c) => srcOf(h, c, "Enemy Kills") };
      let guessed = 0;
      for (const [key] of TL_GENERAL) {
        if (!ready.has(key)) continue;
        for (const [color, group] of twins) {
          const values = twinVals.get(key).get(color);
          const guide = guides[key] || (() => null);
          // The scoreboard's healing adds barrier: the graph's own last values, larger to the larger scoreboard number.
          let end = new Map(group.map((h) => [h, final.get(h)[key]]));
          if (key === "heal" && values[last]) {
            const rank = group.slice().sort((x, y) => final.get(y).heal - final.get(x).heal);
            end = new Map(rank.map((h, i) => [h, values[last][i]]));
          }
          values[last] = null;
          const out = untwin(group, values, end, guide, key === "souls" ? 50 : 0);
          for (const h of group) out.at.get(h).forEach((v, c) => { if (c < last || key === "heal") by.get(h)[key][c] = v; });
          guessed += out.guessed;
        }
      }
      const full = (k) => heroes.filter((h) => by.get(h)[k].every((v) => v !== null)).length;
      log(`timeline done in ${Date.now() - stats.t0} ms, ${stats.frames} frames, ${stats.retries} retries, ${failed.length} failed: ` +
        `${TL_KEYS.concat(["src", "dtype", "taken"]).map((k) => `${k} ${full(k)}/${heroes.length}`).join(", ")}${twins.length ? `; ${guessed} twin column(s) ordered by growth` : ""}`);
      // One line per column: [hero, souls, kills, deaths, pdmg, odmg, heal, souls by source total, damage taken] per
      // player (null: not read).
      logData("timeline", times.map((t, c) => ({ t, p: heroes.map((h) => [h, ...TL_KEYS.map((k) => by.get(h)[k][c]), srcOf(h, c), by.get(h).taken[c]]) })));
      S.timeline = { n, times: times.slice(), by, heroes, healRead: ready.has("heal") };
      timelineStrips();
      paintCells(S.hoverCol); // the sections that need the graphs (damage taken, damage types) have them now
      scanItemNames(gen); // the item hovers wait for the graph reads (both hover stock panels)
    }, null, TL_BUDGET);
  }

  // One hit strip per graph column over the lead graph, from halfway to the previous column to halfway to the
  // next (the last one runs on under the final-lead pill).
  function timelineStrips() {
    const T = S.timeline;
    if (!T || !ok(UI.strips) || !S.graphScale || !(S.duration > 0)) return;
    UI.strips.RemoveAndDeleteChildren();
    const xs = T.times.map((t) => graphX(t, S.duration));
    xs.forEach((x, c) => {
      const left = c ? (xs[c - 1] + x) / 2 : 0;
      const right = c < xs.length - 1 ? (x + xs[c + 1]) / 2 : 1600;
      const strip = $.CreatePanel("Panel", UI.strips, "", { class: "NSGraphStrip", hittest: "true" });
      strip.style.marginLeft = `${left.toFixed(1)}px`;
      strip.style.width = `${Math.max(1, right - left).toFixed(1)}px`;
      strip.SetPanelEvent("onmouseover", () => hoverAt(c));
      strip.SetPanelEvent("onmouseout", () => leaveAt(c));
    });
    log(`timeline: ${xs.length} hover strips`);
  }

  // ---------- stat sections (user 2026-11-23, after Statlocker's Match Summary views) ----------
  // Each of the seven rows shows one stat of its kind (ROW_FAMILY below), its scoreboard stat by default; a click
  // on the row's name changes it. The others are worked out from the scoreboard and the stat timeline's graphs:
  //   souls        souls / min
  //   kills        KDA
  //   deaths       damage taken (from players: the Damage from Players graph, before mitigation, so above
  //                deadlock-api's player_damage_taken: 24,369 against 21,095), damage taken / life
  //   assists      kill participation
  //   player dmg   damage / min, damage / life, bullet (headshots included), headshot (Gun Damage - Crit), ability
  //                (the rest of Damage Dealt by Type, which adds up to the player damage), melee
  //   objective    objective damage / min
  //   healing      healing and barriers (the scoreboard's split: player_healing_healing / _barriering)
  // Per life divides by the deaths (at least 1), like Statlocker. Heal prevented, accuracy, last hits and the like
  // are only in the match metadata, which no script reads (live probe: detailed_postgame/live/
  // 20261123-row-variables-probe-6864.log).
  // key -> [row label, star colour (pg_board.css NSBest_<key>), over time (false: final only, dimmed on a hover)]
  const KEY_INFO = {
    souls: ["TOTAL SOULS", "souls", true], kills: ["KILLS", "kills", true], deaths: ["DEATHS", "deaths", true],
    assists: ["ASSISTS", "assists", false], pdmg: ["PLAYER DAMAGE", "pdmg", true], odmg: ["OBJECTIVE DAMAGE", "odmg", true],
    heal: ["HEALING", "heal", true],
    kda: ["KDA", "kills", false], kp: ["KILL PARTICIPATION", "assists", false], dpm: ["DAMAGE / MIN", "pdmg", true],
    spm: ["SOULS / MIN", "souls", true], dpl: ["DAMAGE / LIFE", "pdmg", true], tpl: ["TAKEN / LIFE", "odmg", true],
    taken: ["DAMAGE TAKEN", "odmg", true], bullet: ["BULLET DAMAGE", "pdmg", true], crit: ["HEADSHOT DAMAGE", "kills", true],
    melee: ["MELEE DAMAGE", "assists", true], ability: ["ABILITY DAMAGE", "pdmg", true], odpm: ["OBJ. DAMAGE / MIN", "odmg", true],
    healing: ["HEALING ONLY", "heal", false], barrier: ["BARRIERS", "heal", false]
  };
  const BASE_AWARD = Object.fromEntries(STATS.map(([key, , award]) => [key, !!award]));
  // What a click on each row's name moves through: the stats of that row's kind, its scoreboard stat first (user
  // 2026-11-23: "based on the per level and if it's suitable on that level"). No stat is in two kinds.
  const ROW_FAMILY = [
    ["souls", "spm"],
    ["kills", "kda"],
    ["deaths", "taken", "tpl"],
    ["assists", "kp"],
    ["pdmg", "dpm", "dpl", "bullet", "crit", "ability", "melee"],
    ["odmg", "odpm"],
    ["heal", "healing", "barrier"]
  ];
  const perMin = (v, t) => (v === null || v === undefined || !(t > 0) ? null : v / (t / 60));
  const perLife = (v, d) => (v === null || v === undefined || d === null || d === undefined ? null : v / Math.max(1, d));
  // Damage Dealt by Type rows -> { bullet, crit, melee, ability } (melee by its English name: other clients count it as ability).
  function damageTypes(rows) {
    if (!rows) return null;
    const gun = loc("#Citadel_Graph_WeaponDamage", "Gun Damage");
    const crit = loc("#Citadel_Graph_WeaponDamageCrit", "Gun Damage - Crit");
    const out = { bullet: 0, crit: 0, melee: 0, ability: 0 };
    let all = 0;
    for (const r of rows) {
      all += r.value;
      if (r.name === gun) out.bullet += r.value;
      else if (r.name === crit) { out.crit += r.value; out.bullet += r.value; }
      else if (/melee/i.test(r.name)) out.melee += r.value;
    }
    out.ability = all - out.bullet - out.melee;
    return out;
  }
  // One stat of one column at graph column c (-1: the end of the match); null when nothing tells it.
  function statAt(col, key, c) {
    const T = S.timeline;
    const p = T ? T.by.get(col.hero) : null;
    const at = c < 0 && T ? T.n - 1 : c;
    const v = (k) => {
      if (c < 0) return col.value[k];
      const a = p && p[k] ? p[k][c] : null;
      return a === undefined ? null : a;
    };
    const time = c < 0 ? S.matchDur : T.times[c];
    const taken = () => (p && at >= 0 ? p.taken[at] : null);
    switch (key) {
      case "kda": return c < 0 ? (v("kills") + v("assists")) / Math.max(1, v("deaths")) : null;
      case "kp": return c < 0 && col.teamKills > 0 ? (v("kills") + v("assists")) / col.teamKills : null;
      case "dpm": return perMin(v("pdmg"), time);
      case "spm": return perMin(v("souls"), time);
      case "odpm": return perMin(v("odmg"), time);
      case "dpl": return perLife(v("pdmg"), v("deaths"));
      case "taken": return taken();
      case "tpl": return perLife(taken(), v("deaths"));
      case "bullet": case "crit": case "melee": case "ability": {
        const split = p && at >= 0 ? damageTypes(p.dtype[at]) : null;
        return split ? split[key] : null;
      }
      case "healing": return c < 0 ? col.split.healing : null;
      case "barrier": return c < 0 ? col.split.barrier : null;
      default: return v(key);
    }
  }
  // A value the graphs have not given: "..." while a graph read is running or due again, then "-" (it never comes:
  // no lead graph, an unread graph, a team with no kills; review 2026-11-23).
  const graphsPending = () => !!S.scanning || !!(S.rescan && S.rescan.gen === S.gen);
  function fmtStat(col, key, v) {
    if (v === null || v === undefined) return graphsPending() ? "..." : "-";
    if (key === "kda") return v.toFixed(2);
    if (key === "kp") return `${(v * 100).toFixed(1)}%`;
    return fmtLike(col.text.souls, v);
  }
  // The seven rows of every column for the picked section, at graph column c (-1: the final board): values, the
  // dimmed final ones a column has no value for, the best-of-12 stars and the row labels.
  function paintCells(c) {
    const hovering = c >= 0;
    STATS.forEach((_, slot) => {
      const key = S.rows[slot];
      const label = UI.rowLabels[slot];
      if (ok(label)) label.SetHasClass("NSRowLabelEmpty", !key);
      if (!key) {
        for (const col of S.cols) paintSlot(col, slot, "", "", false, false, "");
        setText(label, "+ ADD STAT");
        if (ok(label)) label.RemoveClass("NSRowLabelNote");
        return;
      }
      const base = Object.prototype.hasOwnProperty.call(BASE_AWARD, key); // a scoreboard stat: its own text and stars
      const [name, colour, overTime] = KEY_INFO[key];
      const vals = S.cols.map((col) => statAt(col, key, c));
      const finals = hovering ? S.cols.map((col) => statAt(col, key, -1)) : vals;
      const top = (list) => (list.some((x) => x === null || x === undefined) ? null : Math.max(...list));
      // Stars: base at the end keeps the scoreboard's own; a moment with a missing value keeps the final ones.
      const starsOf = (list) => { const t = top(list); return t !== null && t > 0 ? list.map((x) => x === t) : null; };
      let stars = null;
      if (!base || BASE_AWARD[key]) {
        if (base && (!hovering || top(vals) === null)) stars = S.cols.map((col) => !!col.award[key]);
        else stars = starsOf(top(vals) === null ? finals : vals);
      }
      S.cols.forEach((col, i) => {
        const missing = hovering && (vals[i] === null || vals[i] === undefined);
        const text = base && (!hovering || missing) ? col.text[key] : fmtStat(col, key, missing ? finals[i] : vals[i]);
        paintSlot(col, slot, key, text, missing, !!(stars && stars[i]), colour);
      });
      let caption = name;
      // The Healing graph has no barrier; when it was not read the hover shows the final (with barrier) numbers.
      if (hovering && base && key === "heal" && S.timeline && S.timeline.healRead) caption = "HEALING (NO BARRIER)";
      else if (hovering && (!overTime || vals.every((x) => x === null || x === undefined))) caption = `${name} (FINAL)`;
      setText(label, caption);
      if (ok(label)) label.SetHasClass("NSRowLabelNote", caption.length > 16);
    });
  }
  // One cell: its key class (NSCell_<key>), text, dimming and star (NSBest + NSBest_<colour>).
  function paintSlot(col, slot, key, text, dim, star, colour) {
    const [cell, label] = col.slots[slot] || [];
    if (!ok(cell)) return;
    const was = col.slotKey[slot];
    if (was !== key) {
      if (was) cell.RemoveClass(`NSCell_${was}`);
      if (key) cell.AddClass(`NSCell_${key}`);
      col.slotKey[slot] = key;
    }
    setText(label, text);
    cell.SetHasClass("NSCellFinal", dim);
    const had = col.slotStar[slot];
    if (had && (!star || had !== colour)) { cell.RemoveClass(`NSBest_${had}`); col.slotStar[slot] = ""; }
    cell.SetHasClass("NSBest", star);
    if (star && col.slotStar[slot] !== colour) { cell.AddClass(`NSBest_${colour}`); col.slotStar[slot] = colour; }
  }
  // Every row name is clickable (user 2026-11-23: the MORE menu of presets was confusing; removed).
  function wireRows() {
    UI.rowLabels.forEach((label, slot) => {
      if (!ok(label) || label.BHasClass("NSCycle")) return;
      label.AddClass("NSCycle");
      label.SetPanelEvent("onactivate", () => cycleRow(slot, 1));
      label.SetPanelEvent("oncontextmenu", () => cycleRow(slot, -1));
      label.SetPanelEvent("onmouseover", () => rowPips(slot));
      label.SetPanelEvent("onmouseout", () => { if (S.pipSlot === slot) rowPips(-1); });
    });
  }
  // A hovered row name shows its kind as bars on the middle of its bottom border, one per stat, the shown one lit
  // (user 2026-11-23). One strip in the row-name column (#NSRowPips, out of its flow), moved to the hovered row;
  // slot -1 hides it.
  const ROW_H = 38; // .NSRowLabel height
  function rowPips(slot) {
    S.pipSlot = slot;
    const family = slot >= 0 ? ROW_FAMILY[slot] : null;
    const host = family && ok(UI.rowLabels[slot]) ? UI.rowLabels[slot].GetParent() : null;
    if (!ok(UI.pips)) {
      if (!ok(host)) return;
      UI.pips = $.CreatePanel("Panel", host, "NSRowPips", { class: "NSRowPips", hittest: "false" });
    }
    UI.pips.SetHasClass("NSRowPipsOn", !!family);
    if (!family) return;
    while (UI.pips.GetChildCount() < family.length) $.CreatePanel("Panel", UI.pips, "", { class: "NSRowPip", hittest: "false" });
    UI.pips.Children().forEach((pip, i) => {
      pip.SetHasClass("NSRowPipShown", i < family.length);
      pip.SetHasClass("NSRowPipOn", i < family.length && family[i] === S.rows[slot]);
    });
    // Street Brawl drops row 1 (NSNoTotal): the rows under it move up one.
    const row = slot - (slot > 0 && ok(UI.labels) && UI.labels.BHasClass("NSNoTotal") ? 1 : 0);
    UI.pips.style.y = `${(row + 1) * ROW_H - 3}px`;
  }
  // A click on a row's name moves that row to the next stat of its kind (ROW_FAMILY; a right click: the one before),
  // so a row never shows another row's stat.
  function cycleRow(slot, dir) {
    const family = ROW_FAMILY[slot];
    if (stopped || !family) return;
    const at = family.indexOf(S.rows[slot]);
    const next = family[((at < 0 ? 0 : at + dir) + family.length) % family.length];
    if (next === S.rows[slot]) return; // a kind of one stat
    const rows = S.rows.slice();
    rows[slot] = next;
    log(`row ${slot + 1}: ${next}`);
    PF.clicked = true;
    rowHint();
    setRows(rows, true);
    if (S.pipSlot === slot) rowPips(slot);
  }
  // "CLICK A ROW NAME TO SWAP" over the row names until the player has clicked one, in this session or an earlier
  // one (user 2026-11-23). Hidden until the save page has answered or given up, so it never flashes on for a
  // player who already knows.
  function rowHint() {
    if (ok(UI.rowHint)) UI.rowHint.SetHasClass("NSRowHintOn", PF.asked && !PF.clicked);
  }
  function setRows(rows, byUser) {
    if (rows.join(",") === S.rows.join(",")) return;
    if (byUser && PF.read !== "done") rows.forEach((key, slot) => { if (key !== S.rows[slot]) PF.touched.add(slot); });
    S.rows = rows;
    if (byUser) prefsSave();
    paintCells(S.hoverCol);
  }

  // ---------- saved rows (user 2026-11-23: "make it have a persistent save ... fine to use web for saving") ----------
  // The seven row keys live in the hpv2-store page dps/v1 (Steam's CEF localStorage on this PC, nothing on a
  // server), reached through a hidden CitadelHTMLPanel the way Observer HUD's store is: the request in the URL
  // fragment, the reply in the page title (prefix DPS1:). Read when the board first shows, and again on the next
  // show or row click while no read has been answered. A row changed before the answer keeps the change; the
  // others take the saved stat. Written PREFS_SAVE_S after the last change, never before a read was answered (a
  // write then would put the scoreboard's stats over the saved rows). No answer: the board keeps the rows it has,
  // and says so in the log.
  const PREFS_URL = "https://hantu-raya.github.io/hpv2-store/dps/v1/";
  const PREFS_PREFIX = "DPS1:";
  const PREFS_HELLO_S = 2; // greeted at 0, 2, 4 and 6 s (the third from a blank page: a lost first load never answers)
  const PREFS_HELLO_TRIES = 4;
  const PREFS_OP_S = 4;
  const PREFS_SAVE_S = 1;
  // read: "" (not asked), "asking", "done" (answered: rows or nothing saved). touched: the rows changed by a click
  // before then.
  const PF = { panel: null, handler: false, phase: "idle", gen: 0, seq: 0, id: "", tries: 0, queue: [], cur: null, read: "",
    touched: new Set(), saveToken: 0, asked: false, clicked: false };
  // A saved row keeps its stat when the stat is of that row's kind, else shows the row's scoreboard stat (an older
  // save could hold a preset's layout).
  const cleanRows = (raw) => {
    if (!Array.isArray(raw) || raw.length !== STATS.length) return null;
    return raw.map((key, slot) => (ROW_FAMILY[slot].includes(key) ? key : ROW_FAMILY[slot][0]));
  };
  function prefsPanel() {
    if (ok(PF.panel)) return PF.panel;
    const wrap = $.CreatePanel("Panel", ctx, "NSPrefsWrap", { class: "NSPrefsWrap", hittest: "false" });
    PF.panel = $.CreatePanel("CitadelHTMLPanel", wrap, "NSPrefs", { class: "NSPrefs", hittest: "false", acceptsfocus: "false" });
    PF.handler = false;
    return PF.panel;
  }
  function prefsSend(message) {
    const panel = prefsPanel();
    if (!PF.handler) {
      PF.handler = true;
      $.RegisterEventHandler("HTMLTitle", panel, onPrefsTitle);
    }
    panel.SetURL(`${PREFS_URL}#${encodeURIComponent(JSON.stringify(message))}`);
  }
  function prefsOp(op) {
    PF.queue.push(op);
    if (PF.phase !== "idle") return;
    PF.phase = "hello";
    PF.tries = 0;
    prefsHello(++PF.gen);
  }
  function prefsHello(gen) {
    if (stopped || gen !== PF.gen || PF.phase !== "hello") return;
    if (PF.tries >= PREFS_HELLO_TRIES) { prefsGiveUp(); return; }
    try {
      if (PF.tries === 2) PF.panel.SetURL("about:blank");
      PF.tries++;
      PF.id = `h${++PF.seq}`;
      prefsSend({ i: PF.id, o: "hello" });
    } catch (e) {
      prefsGiveUp();
      return;
    }
    $.Schedule(PREFS_HELLO_S, () => prefsHello(gen));
  }
  function prefsNext() {
    while (PF.queue.length && PF.queue[0].gen !== undefined && PF.queue[0].gen !== S.gen) PF.queue.shift(); // an old match's
    const op = PF.queue.shift();
    if (!op) { prefsDone(); return; }
    const gen = ++PF.gen;
    PF.phase = "op";
    PF.cur = op;
    PF.id = `${op.o}${++PF.seq}`;
    const message = { i: PF.id, o: op.o };
    if (op.o === "w") message.c = op.c;
    if (op.o === "it") { message.m = op.m; message.h = op.h; }
    try {
      prefsSend(message);
    } catch (e) {
      prefsGiveUp();
      return;
    }
    $.Schedule(op.o === "it" ? BUY_IT_S : PREFS_OP_S, () => { if (!stopped && gen === PF.gen && PF.phase === "op") prefsGiveUp(); });
  }
  function onPrefsTitle(panelOrTitle, eventTitle) {
    if (stopped) return;
    const title = eventTitle !== undefined ? eventTitle : panelOrTitle;
    if (typeof title !== "string" || title.indexOf(PREFS_PREFIX) !== 0) return;
    let reply = null;
    try { reply = JSON.parse(title.slice(PREFS_PREFIX.length)); } catch (e) { return; }
    if (!reply || typeof reply !== "object" || reply.i !== PF.id) return; // late, duplicate or foreign
    if (reply.o === "ready" && PF.phase === "hello") {
      if (typeof reply.h !== "string" || reply.h.split("#")[0] !== PREFS_URL || reply.v !== 1 || reply.ok !== true) { prefsGiveUp(); return; }
      prefsNext();
      return;
    }
    const op = PF.cur;
    if (PF.phase !== "op" || !op || reply.o !== op.o) return;
    if (op.o === "r") {
      let rows = null;
      let record = null;
      if (reply.ok === true && reply.x === 1) { try { record = JSON.parse(reply.v); rows = cleanRows(record.rows); } catch (e) { rows = null; } }
      // A row was clicked in an earlier session: the save says so (clicked, written since 2026-11-23), or its rows
      // are not the scoreboard's (an older save).
      if (rows && (record.clicked === true || rows.join(",") !== STATS.map(([key]) => key).join(","))) PF.clicked = true;
      PF.asked = true;
      rowHint();
      const kept = Array.from(PF.touched).sort();
      PF.read = "done";
      PF.touched.clear();
      if (rows) setRows(rows.map((key, slot) => (kept.includes(slot) ? S.rows[slot] : key)), false);
      log(`prefs: ${rows ? `rows ${rows.map((key) => key || "-").join(",")}` : "nothing saved"}${kept.length ? ` (row ${kept.map((i) => i + 1).join(", ")} changed meanwhile: kept)` : ""}`);
      if (kept.length) prefsSave();
    } else if (op.o === "it") onBuyReply(op, reply);
    else if (op.o === "w") log(`prefs: ${reply.ok === true ? "saved" : `not saved (${reply.e || "?"})`}`);
    prefsNext();
  }
  function prefsDone() {
    PF.gen++;
    PF.phase = "idle";
    PF.id = "";
    PF.cur = null;
    try { if (ok(PF.panel)) PF.panel.SetURL("about:blank"); } catch (e) { /* the panel is gone */ }
  }
  function prefsGiveUp() {
    log("prefs: no answer from the save page");
    if (BUY.state === "asking") buyFailed("the save page did not answer", "ITEM TIMES: DEADLOCK-API NOT REACHED. TRY AGAIN LATER");
    PF.asked = true; // no answer: the hint shows, unless a row was clicked this session
    rowHint();
    PF.queue = [];
    if (PF.read === "asking") PF.read = ""; // asked again on the next show or row click
    prefsDone();
  }
  function prefsLoad() {
    if (PF.read) return;
    PF.read = "asking";
    prefsOp({ o: "r" });
  }
  function prefsSave() {
    const token = ++PF.saveToken;
    $.Schedule(PREFS_SAVE_S, () => {
      if (stopped || token !== PF.saveToken) return;
      if (PF.read !== "done") { prefsLoad(); return; } // its answer saves the clicked rows over the saved ones
      PF.queue = PF.queue.filter((op) => op.o !== "w");
      prefsOp({ o: "w", c: JSON.stringify({ v: 1, rows: S.rows, clicked: true }) }); // only a click saves
    });
  }
  function prefsClose() {
    if (!ok(PF.panel)) return;
    const wrap = PF.panel.GetParent();
    (ok(wrap) && wrap.id === "NSPrefsWrap" ? wrap : PF.panel).DeleteAsync(0);
    PF.panel = null;
  }

  // ---------- final item slots: names, extra-slot locks and purchase times ----------
  // User 2026-11-23: buy times from deadlock-api's purchase history; then "add the locked on the flex slot since
  // they did not get the walkers like the gameplay does it", "remove the items if the player havent bought it rather
  // being grey", "the empty spaces don't have the time", "it's 3 slot conditional", "do it without the api and use
  // based on the graph", "reduce api usage as possible and check the ingame first", and say when a match is still
  // too new for deadlock-api.
  // In game first: the stock row always holds 12 CitadelModIcon panels, empty slots included, with no item id or
  // name on them (probe 2026-11-23, detailed_postgame/live/20261123-item-icons-probe-6864.log). Hovering one shows the
  // stock CitadelModDetailsTooltip with the item's name first, one frame later. An empty slot's icon has no item
  // category class (isWeapon, isArmor, isTech) and is not hovered. So once the graphs are read the board hovers each
  // item icon for a frame (the TooltipManager layer at opacity 0 meanwhile, so nothing flashes) and reads its name. 9 slots are open from the start and one more per enemy Walker the
  // team kills (the game's Citadel_FlexSlotUnlockedSlot02-04), read from the lead graph's lane objectives (tier 2).
  // The board then shows each player's 12 cells as the game does: the items, blank empty slots, a lock per extra slot
  // not open yet. Only purchase times need deadlock-api: asked through the save page (dps/v1, op "it") on the
  // first hover of the lead graph or of a player's items, once per match per game session, again after
  // BUY_RETRY_MS when it failed. A hovered item then shows when it was bought, and on a graph hover the items not
  // bought by then are left out.
  const ITEM_SLOTS = 12;
  const FLEX_SLOTS = 3;
  const LOCK_ICON = "s2r://panorama/images/upgrades/lock_icon_psd.vtex";
  const BUY_IT_S = 20; // per player; the page's own request gives up at 15 s
  const BUY_TIP_FRAMES = 3; // frames to wait for an icon's name in the tooltip
  const BUY_TAIL_S = 0.5; // the tooltip layer stays hidden this long after the last hover (the stock hide lags)
  const BUY_RETRY_MS = 60000;
  // Styled inline: the board's stylesheet does not reach the stock scoreboard's panels (live 2026-11-23).
  // 14 px and 2 px sides: the 45 px icon (shown at 75 %) holds "28:01"; 17 px with 5 px sides cut "17:23" to "17..."
  // (user screenshot 2026-11-23). noclip: a longer time ("1:02:03") draws past the icon's edges instead of an ellipsis.
  const BUY_LABEL = { horizontalAlign: "center", verticalAlign: "bottom", marginBottom: "2px", padding: "1px 2px", borderRadius: "3px",
    backgroundColor: "#10130Ddd", color: "#FFEFD7", fontSize: "14px", fontWeight: "bold", letterSpacing: "0px", textOverflow: "noclip",
    zIndex: "10", visibility: "collapse" };
  // opacity inline as on the stock icons (styleItems): stock rules may fade the container's children.
  // A blank cell is drawn as the game's empty item slot, a dark square with a thin light border (user 2026-11-23: "like
  // the base game empty boxes"); a locked one has the stock item lock on it. It lives in the stock icon, first and the
  // icon's full size, shown only on a blank cell (the game rebuilds ItemsContainer's children and drops any it did not
  // make; a 0 px box with overflow noclip drew nothing: live 2026-11-23).
  const CELL_BOX = { width: "100%", height: "100%", visibility: "collapse" };
  const CELL_STYLE = { width: "100%", height: "100%", backgroundColor: "#0000004d", border: "1px solid #FFEFD733", borderRadius: "3px" };
  const LOCK_IMG = { width: "55%", height: "55%", horizontalAlign: "center", verticalAlign: "center", opacity: "0.6" };
  const BUY = { gen: -1, state: "", wait: 0, by: new Map(), failed: "", missing: 0, at: 0, names: new Map(), cache: new Map() };
  const itemIcons = (col) => (ok(col.items) ? col.items.Children().filter((p) => ok(p) && p.paneltype === "CitadelModIcon") : []);
  // An empty slot's icon has no item category class (probe 2026-11-23: Ivy's last three, 9 items owned).
  const emptySlot = (icon) => !icon.BHasClass("isWeapon") && !icon.BHasClass("isArmor") && !icon.BHasClass("isTech");

  // An item's name in the player's language (cached; the class name itself when the game has no such token).
  function itemName(cls) {
    if (!BUY.names.has(cls)) BUY.names.set(cls, loc(`#${cls}`, cls).trim().toLowerCase());
    return BUY.names.get(cls);
  }
  // The first label of the stock item tooltip, "" while it shows none.
  function itemTipName() {
    const tip = windowRoot().FindChildTraverse("CitadelModDetailsTooltip");
    if (!ok(tip) || !tip.visible) return "";
    let first = "";
    const walk = (p) => {
      if (first || !ok(p) || !p.visible) return;
      if (p.paneltype === "Label") {
        const t = String(p.text || "").trim();
        if (t) { first = t; return; }
      }
      for (const kid of p.Children()) walk(kid);
    };
    walk(tip);
    return first;
  }
  // Each icon's item name ("" for an empty slot), then the slots (checkFlex, paintSlots) and any purchase times.
  function scanItemNames(gen) {
    if (stopped || gen !== S.gen || S.namesGen === gen) return;
    const list = [];
    for (const col of S.cols) {
      col.iconNames = new Map();
      itemIcons(col).forEach((icon, i) => list.push({ col, icon, first: i === 0, name: "" }));
    }
    if (!list.length) return;
    let layer = null;
    const hideLayer = () => {
      if (!ok(layer)) layer = windowRoot().FindChildTraverse("TooltipManager");
      if (ok(layer)) layer.style.opacity = "0";
    };
    hideLayer();
    const layerAtStart = ok(layer);
    const t0 = Date.now();
    let at = 0;
    let wait = 0;
    let frames = 0;
    let prev = "";
    let seen = new Set();
    const out = (e) => { try { $.DispatchEvent("DispatchPanelEvent", e.icon, "onmouseout"); } catch (err) { /* the icon is gone */ } };
    const done = () => {
      // Back to 1, not null: live, opacity 0 then null leaves a panel hidden (observer_hud validator, stuckHidden).
      $.Schedule(BUY_TAIL_S, () => { if (ok(layer)) layer.style.opacity = "1"; });
      if (stopped || gen !== S.gen) return;
      for (const e of list) e.col.iconNames.set(e.icon, e.name);
      for (const col of S.cols) col.stockOrder = Array.from(col.iconNames.keys()); // put back on teardown
      S.namesGen = gen;
      const named = list.filter((e) => e.name).length;
      log(`slots: ${named} items, ${list.length - named} empty, read in ${Date.now() - t0} ms, ${frames} frames` +
        `${layerAtStart ? "" : ok(layer) ? ", tooltip layer found late" : ", no tooltip layer to hide"}`);
      checkFlex();
      applyBuys();
      paintSlots(S.hoverCol);
    };
    const read = () => {
      if (stopped || gen !== S.gen) { out(list[at]); done(); return; }
      frames++;
      wait++;
      if (!ok(layer)) hideLayer();
      const name = itemTipName();
      // A new name, or the same one once BUY_TIP_FRAMES passed (two players may own the item read last).
      if ((!name || name === prev) && wait < BUY_TIP_FRAMES) { $.Schedule(0, read); return; }
      list[at].name = name && !seen.has(name) ? name : ""; // nobody owns an item twice
      if (name) prev = name;
      if (list[at].name) seen.add(list[at].name);
      out(list[at]);
      at++;
      next();
    };
    const next = () => {
      if (stopped || gen !== S.gen || at >= list.length) { done(); return; }
      if (list[at].first) seen = new Set();
      if (emptySlot(list[at].icon)) { at++; next(); return; } // nothing to hover: an empty slot
      wait = 0;
      try { $.DispatchEvent("DispatchPanelEvent", list[at].icon, "onmouseover"); } catch (err) { at++; next(); return; }
      $.Schedule(0, read);
    };
    next();
  }
  // The locks follow the Walker kills only when the end agrees: nobody owns more items than their team's slots.
  function checkFlex() {
    S.flex = false;
    const W = S.walkers;
    if (!W) { log("slots: no lane objectives read: no extra-slot locks"); return; }
    // Street Brawl (every player on the same souls) has its own rules, and its lane objectives read as Walkers at
    // 0:01 (live 136872372); no real Walker falls in the first minute either.
    if (S.sameTotal) { log("slots: Street Brawl: no extra-slot locks"); return; }
    if (W.some((w) => w.some((t) => t < 60))) { log("slots: a Walker in the first minute: the lane objectives are not trusted, no locks"); return; }
    for (const col of S.cols) {
      const owned = Array.from(col.iconNames.values()).filter(Boolean).length;
      const open = ITEM_SLOTS - FLEX_SLOTS + Math.min(FLEX_SLOTS, W[col.teamIndex].length);
      if (owned > open) {
        log(`slots: hero ${col.hero} ends with ${owned} items, more than ${open} slots: the Walker kills are not trusted, no locks`);
        return;
      }
    }
    S.flex = true;
    log(`slots: extra slots open at the end ${W.map((w) => Math.min(FLEX_SLOTS, w.length)).join("/")} (Walkers at ${W.map((w) => w.map(clock).join(",") || "-").join(" / ")})`);
  }
  // At graph column c (-1: the end) each player's 12 cells, the stock icons in place: an item owned then shows, an
  // item not bought yet and an empty slot are blank (the icon's own stack faded, an empty-slot frame drawn), and the last blank cells carry a lock
  // per extra slot the team had not opened. Without trusted locks there are no locks; the blank cells stay.
  function paintSlots(c) {
    if (S.namesGen !== S.gen) return;
    const T = S.timeline;
    const time = c >= 0 && T ? T.times[c] : Infinity;
    for (const col of S.cols) {
      if (!col.iconNames) continue;
      // The items owned then in the order they were bought (user 2026-11-23; no time yet: the stock order, after the
      // timed ones), then the blank cells in the stock order.
      const cells = Array.from(col.iconNames).filter(([icon]) => ok(icon)).map(([icon, name], i) => {
        const bought = col.buyAt ? col.buyAt.get(icon) : undefined;
        return { icon, i, t: bought === undefined ? Infinity : bought, on: !!name && !(bought > time) };
      });
      const shown = cells.filter((e) => e.on).sort((a, b) => a.t - b.t || a.i - b.i);
      const blanks = cells.filter((e) => !e.on).map((e) => e.icon);
      for (const e of cells) css(e.icon.FindChild("modIconContainer"), { opacity: e.on ? "1" : "0" });
      placeIcons(col, shown.map((e) => e.icon).concat(blanks));
      const open = S.flex ? Math.min(FLEX_SLOTS, S.walkers[col.teamIndex].filter((t) => t <= time).length) : FLEX_SLOTS;
      const locked = new Set(blanks.slice(Math.max(0, blanks.length - (FLEX_SLOTS - open))));
      for (const e of cells) slotCell(e.icon, !e.on, locked.has(e.icon));
    }
  }
  // The stock icons in this order (moved within their own container; only when the order changed).
  function placeIcons(col, icons) {
    if (!ok(col.items) || (col.placed && col.placed.length === icons.length && col.placed.every((p, i) => p === icons[i]))) return;
    icons.forEach((icon, i) => {
      const at = col.items.GetChild(i);
      if (ok(at) && at !== icon) col.items.MoveChildBefore(icon, at);
    });
    col.placed = icons;
  }
  // A blank cell's empty-slot frame (#NSSlotCell), with the lock (#NSSlotLock) when the slot was not open.
  function slotCell(icon, blank, locked) {
    let box = icon.FindChild("NSSlotCell");
    if (!blank && !ok(box)) return;
    if (!ok(box)) {
      box = $.CreatePanel("Panel", icon, "NSSlotCell", { hittest: "false" });
      css(box, CELL_BOX);
      const cell = $.CreatePanel("Panel", box, "", { hittest: "false" });
      css(cell, CELL_STYLE);
      const img = $.CreatePanel("Image", cell, "NSSlotLock", { src: LOCK_ICON, scaling: "stretch-to-fit-preserve-aspect", hittest: "false" });
      if (typeof img.SetImage === "function") img.SetImage(LOCK_ICON);
      css(img, LOCK_IMG);
      const first = icon.GetChild(0);
      if (ok(first) && first !== box) icon.MoveChildBefore(box, first);
    }
    css(box, { visibility: blank ? "visible" : "collapse" });
    css(box.FindChildTraverse("NSSlotLock"), { visibility: locked ? "visible" : "collapse" });
  }

  // The note under FINAL ITEMS: asking, or why there are no buy times ("" hides it).
  function buyNote(text) {
    setText(UI.buyNote, text);
    if (ok(UI.buyNote)) UI.buyNote.SetHasClass("NSBuyNoteOn", !!text);
  }
  // On the first hover of the lead graph or of a player's items: the purchase times, once per match per session.
  function wantBuys() {
    if (stopped || !S.key || !/^\d{1,12}$/.test(S.matchId)) return;
    if (BUY.gen === S.gen && (BUY.state === "asking" || BUY.state === "done" || (BUY.state === "failed" && Date.now() - BUY.at < BUY_RETRY_MS))) return;
    BUY.gen = S.gen;
    BUY.at = Date.now();
    const cached = BUY.cache.get(S.matchId);
    if (cached) {
      BUY.by = cached;
      BUY.state = "done";
      applyBuys();
      return;
    }
    const heroes = S.cols.map((c) => c.hero).filter((h) => h > 0);
    if (!heroes.length) return;
    BUY.state = "asking";
    BUY.wait = heroes.length;
    BUY.by = new Map();
    BUY.failed = "";
    BUY.missing = 0;
    buyNote("ITEM TIMES: ASKING DEADLOCK-API...");
    for (const h of heroes) prefsOp({ o: "it", m: S.matchId, h, gen: S.gen });
  }
  function buyFailed(why, note) {
    BUY.state = "failed";
    BUY.at = Date.now();
    log(`buys: no purchase history (${why})`);
    buyNote(note);
  }
  function onBuyReply(op, reply) {
    if (op.gen !== S.gen || BUY.gen !== op.gen || BUY.state !== "asking") return;
    if (reply.ok === true && reply.x === 1 && Array.isArray(reply.v)) {
      BUY.by.set(op.h, reply.v.filter((r) => Array.isArray(r) && typeof r[0] === "string" && r[0].length < 80 && Number.isFinite(r[1]) && Number.isFinite(r[2])));
    } else if (reply.ok === true && reply.x === 0) BUY.missing++;
    else BUY.failed = String(reply.e || "?").slice(0, 40);
    if (--BUY.wait > 0) return;
    if (!BUY.by.size) {
      if (BUY.failed) buyFailed(`deadlock-api: ${BUY.failed}`, "ITEM TIMES: DEADLOCK-API NOT REACHED. TRY AGAIN LATER");
      else buyFailed("deadlock-api does not have this match yet", "ITEM TIMES: THIS MATCH IS TOO NEW FOR DEADLOCK-API. TRY AGAIN LATER");
      return;
    }
    BUY.state = "done";
    BUY.cache.set(S.matchId, BUY.by);
    buyNote("");
    applyBuys();
  }
  // Each named icon's purchase: the last time it was bought and kept (deadlock-api lists every purchase in order).
  function applyBuys() {
    if (stopped || S.namesGen !== S.gen || BUY.gen !== S.gen || BUY.state !== "done") return;
    let named = 0;
    let timed = 0;
    for (const col of S.cols) {
      col.buyAt = new Map();
      for (const [icon, name] of col.iconNames || []) {
        if (!name || !ok(icon)) continue;
        named++;
        let t = -1;
        for (const [cls, bought, sold] of BUY.by.get(col.hero) || []) if (!sold && itemName(cls) === name.toLowerCase()) t = Math.max(t, bought);
        if (t < 0) continue;
        timed++;
        col.buyAt.set(icon, t);
        // Inside the icon's own stack (modIconContainer: its children overlap; the icon flows its own down).
        const host = icon.FindChildTraverse("modIconContainer") || icon;
        let label = host.FindChild("NSBuyTime");
        if (!ok(label)) {
          label = $.CreatePanel("Label", host, "NSBuyTime", { text: "", hittest: "false" });
          css(label, BUY_LABEL);
        }
        label.text = clock(t);
        (col.buyLabels = col.buyLabels || []).push(label);
      }
    }
    log(`buys: ${timed}/${named} items timed`);
    paintSlots(S.hoverCol);
  }
  // The hovered item's buy time (pollHover); off: hidden.
  function buyLabel(icon, on) {
    if (!ok(icon)) return;
    const host = icon.FindChildTraverse("modIconContainer") || icon;
    css(host.FindChild("NSBuyTime"), { visibility: on ? "visible" : "collapse" });
  }
  // teardown: the stock rows are reused by the next match.
  function slotsClear(col) {
    if (col.stockOrder) { col.placed = null; placeIcons(col, col.stockOrder.filter(ok)); }
    for (const p of col.buyLabels || []) if (ok(p)) p.DeleteAsync(0);
    col.buyLabels = [];
    for (const icon of (col.iconNames || new Map()).keys()) {
      if (!ok(icon)) continue;
      css(icon.FindChild("modIconContainer"), { opacity: "1" });
      const cell = icon.FindChild("NSSlotCell");
      if (ok(cell)) cell.DeleteAsync(0);
    }
  }

  // The board at graph column c: the picked section's numbers at that moment (paintCells), the sources, the header.
  function hoverAt(c) {
    const T = S.timeline;
    if (stopped || !T || c < 0 || c >= T.n) return;
    S.hoverCol = c;
    S.hoverToken++;
    paintCells(c);
    paintSlots(c);
    wantBuys();
    for (const col of S.cols) {
      const p = T.by.get(col.hero);
      if (ok(col.column)) col.column.AddClass("NSAtTime");
      if (ok(col.souls)) {
        const src = p ? p.src[c] : null;
        const end = S.finalSouls.get(col.hero);
        col.souls.AddClass("NSStatic");
        col.souls.SetHasClass("NSSoulsFinal", !src && !!end);
        fillSouls(col, src || (end ? end.rows : []));
      }
    }
    if (S.head) {
      [0, 1].forEach((i) => {
        // Team sums from the players; the last column keeps the totals rows (the graphs can be a soul off).
        const sum = (key) => {
          if (c === T.n - 1) return null;
          let s = 0;
          for (const h of S.head.heroes[i]) {
            const v = T.by.has(h) ? T.by.get(h)[key][c] : null;
            if (v === null) return null;
            s += v;
          }
          return s;
        };
        const worth = sum("souls");
        const kills = sum("kills");
        setText(UI.worth[i], worth === null ? S.head.worth[i] : fmtK(worth));
        setText(UI.kills[i], kills === null ? S.head.kills[i] : String(kills));
      });
    }
    const t = T.times[c];
    setText(UI.clock, clock(t));
    if (ok(UI.frame)) UI.frame.AddClass("NSAtTime");
    // Cursor: a hairline at the column, a dot on the lead line, the time and the lead in a chip.
    const x = graphX(t, S.duration);
    css(UI.cursor, { marginLeft: `${(x - 1).toFixed(1)}px` });
    const lead = S.leadAt.get(t);
    const side = lead === undefined || fmtK(Math.abs(lead)) === "0.0K" ? -1 : lead > 0 ? 0 : 1;
    if (ok(UI.cursorDot)) {
      UI.cursorDot.SetHasClass("NSNoLead", lead === undefined || !S.graphYOf);
      UI.cursorDot.SetHasClass("NSPeakDotTeam1", side === 0);
      UI.cursorDot.SetHasClass("NSPeakDotTeam2", side === 1);
      if (lead !== undefined && S.graphYOf) css(UI.cursorDot, { marginLeft: `${(x - 6).toFixed(1)}px`, marginTop: `${(S.graphYOf(lead) - 6).toFixed(1)}px` });
    }
    if (ok(UI.chip)) {
      setText(UI.chip, lead === undefined ? clock(t) : side < 0 ? `${clock(t)}  EVEN` : `${clock(t)}  +${fmtK(Math.abs(lead))}`);
      UI.chip.SetHasClass("NSChipTeam1", side === 0);
      UI.chip.SetHasClass("NSChipTeam2", side === 1);
      const CHIP_W = 112; // .NSGraphChip width
      const left = x + 8 + CHIP_W <= CHART_W ? x + 8 : x - 8 - CHIP_W;
      css(UI.chip, { marginLeft: `${Math.max(0, left).toFixed(1)}px` });
    }
    if (ok(UI.hover)) UI.hover.AddClass("NSHoverOn");
  }

  // The mouse left strip c: the final numbers come back unless it is already on another strip.
  function leaveAt(c) {
    if (S.hoverCol !== c) return;
    S.hoverCol = -1;
    const token = ++S.hoverToken;
    $.Schedule(RESTORE_S, () => { if (!stopped && token === S.hoverToken && S.hoverCol < 0) restoreFinal(); });
  }

  function restoreFinal() {
    S.hoverCol = -1;
    paintCells(-1);
    paintSlots(-1);
    for (const col of S.cols) {
      if (ok(col.column)) col.column.RemoveClass("NSAtTime");
      if (ok(col.souls) && col.souls.BHasClass("NSStatic")) {
        const end = S.finalSouls.get(col.hero);
        col.souls.RemoveClass("NSSoulsFinal");
        fillSouls(col, end ? end.rows : []);
      }
    }
    if (S.head) {
      [0, 1].forEach((i) => { setText(UI.worth[i], S.head.worth[i]); setText(UI.kills[i], S.head.kills[i]); });
      setText(UI.clock, S.head.clock);
    }
    if (ok(UI.frame)) UI.frame.RemoveClass("NSAtTime");
    if (ok(UI.hover)) UI.hover.RemoveClass("NSHoverOn");
  }

  // teardown: no timeline, no strips, the final numbers (the columns themselves go with the build).
  function timelineClear() {
    if (S.hoverCol >= 0 || (ok(UI.hover) && UI.hover.BHasClass("NSHoverOn"))) restoreFinal();
    S.hoverToken++;
    S.timeline = null;
    S.finalSouls = new Map();
    S.leadAt = new Map();
    S.graphYOf = null;
    S.duration = 0;
    if (ok(UI.strips)) UI.strips.RemoveAndDeleteChildren();
  }

  // ---------- loop ----------

  // One check. Returns whether the page shows.
  function step() {
    if (!ok(UI.page)) {
      UI.page = findPage();
      if (!ok(UI.page)) return false;
      UI.screen = UI.page.FindChildTraverse("ScoreboardScreen");
      UI.scoreboard = UI.page.FindChildTraverse("Scoreboard");
      UI.graphs = UI.page.FindChildTraverse("Graphs");
    }
    if (S.hooked !== UI.page) {
      S.hooked = UI.page;
      // A screen pick (live: the index, 3 = Scoreboard) is a page event, not an unhandled one.
      $.RegisterEventHandler("CitadelPostGameSelectScreenIndex", UI.page, () => { if (!stopped) wake(SCREEN_WAKE_MS); });
    }
    if (!ok(UI.scoreboard) || !ok(UI.graphs) || !ok(UI.screen)) return false;
    if (!UI.page.BHasClass("PageVisible")) {
      if (S.loadingSince) { S.loadingSince = 0; progressHide(); }
      // Closed with the mouse on the lead graph: no onmouseout comes, so the final numbers come back here.
      if (S.hoverCol >= 0) restoreFinal();
      // Closed while the graphs are read: a hidden graph reads nothing, so the scan would finish with no values
      // and the same match never scans again. Drop the board; the next show builds and reads it afresh.
      if (S.key && S.scanning && S.scanning === S.gen) {
        log("scan: the page closed before the graphs were read; read again on the next show");
        teardown();
        S.key = "";
      }
      return false;
    }
    fitBoard();
    // The board builds while the page opens on the Team1 screen; the entrance plays when the Scoreboard
    // screen comes into focus and is re-armed once that screen has been away a while (playIntro).
    const focused = UI.screen.BHasClass("Focused");
    if (!focused && S.focused) S.blurAt = Date.now();
    S.focused = focused;
    if (!focused && S.hoverCol >= 0) restoreFinal(); // the carousel moved with the mouse on the lead graph
    if (S.key && focused && !S.introShown) playIntro();
    if (S.key && !focused && S.introShown && Date.now() - S.blurAt >= INTRO_RESET_MS) resetIntro();
    // A graph tooltip shown off the Graphs screen is left over (the carousel moved while the mouse was on the
    // graph, user 2026-10-26; or an interrupted scan): hide it the stock way. On the Graphs screen the stock
    // owns it: shown on a column's mouseover, hidden on its mouseout.
    if (ok(UI.tip) && S.scanning !== S.gen && UI.tip.BHasClass(TIP_SHOWN)) {
      const graphsShown = ok(UI.graphs.GetParent()) && UI.graphs.GetParent().BHasClass("Focused");
      if (!graphsShown) hideTip();
    }
    // A scan that found no graph of this match yet runs again (retryScan), once its second is up.
    const again = S.rescan;
    if (again && (again.gen !== S.gen || (!S.scanning && Date.now() >= again.at))) {
      S.rescan = null;
      if (again.gen === S.gen) scan(again.m, again.attempt);
    }
    // Item icons can arrive after the build: one column is recounted per check.
    if (S.key) recountItems();
    // Steady state: the first row's bound label still reads what the board was built from.
    // Rows are reused across matches, so panel identity is not enough.
    if (S.key && ok(S.bound) && String(S.bound.text) === S.sig) return true;
    const m = readMatch();
    if (!m) { loading(); return true; }
    S.bound = m.teams[0].rows[0].row.FindChild("NSBinds").FindChild("NSBind");
    S.sig = String(S.bound.text);
    const key = matchKey(m);
    if (key === S.key) { if (S.loadingSince) { S.loadingSince = 0; progressHide(); } return true; }
    S.key = key;
    S.loadingSince = 0;
    build(m);
    return true;
  }

  function tick() {
    if (stopped) return;
    if (!ok(ctx)) { // the page panel is gone: stop for good
      try { ctx.NSStop(); } catch (e) { stopped = true; }
      return;
    }
    try {
      step();
    } catch (e) {
      logOnce(`tick:${e}`, `tick failed: ${e}`);
    }
    const token = ++S.loop;
    $.Schedule(Date.now() < S.burstUntil ? BURST_S : FLOOR_S, () => { if (token === S.loop) tick(); });
  }

  // An event checks at once and then every BURST_S for ms; a pending check is superseded.
  function wake(ms) {
    S.burstUntil = Math.max(S.burstUntil, Date.now() + ms);
    tick();
  }

  bindUI();
  log("board loaded");
  // Arrives about 0.5 s after citadel_match_details, also while the page is hidden (live P4).
  matchListener = $.RegisterForUnhandledEvent("CitadelMatchDetailsUpdated", () => { if (!stopped) wake(MATCH_WAKE_MS); });
  wake(MATCH_WAKE_MS); // the page layout loads for a match
})();
