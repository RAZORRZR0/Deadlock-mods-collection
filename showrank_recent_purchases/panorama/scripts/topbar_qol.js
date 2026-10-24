// Topbar QoL: ult cooldown text, always-visible nicknames, live soul-difference tracker.
// Standalone so it survives ShowRank (showrank_barebones.js) refreshes. Runs in the citadel_hud_top_bar context.
(() => {
  "use strict";

  const TICK_SECONDS = 0.5;
  const root = $.GetContextPanel();

  const valid = (p) => !!p?.IsValid?.();
  const find = (p, id) => { try { return valid(p) ? p.FindChildTraverse(id) : null; } catch (e) { return null; } };
  const byClass = (p, c) => { try { return valid(p) ? p.FindChildrenWithClassTraverse(c) || [] : []; } catch (e) { return []; } };
  const text = (p) => { try { return valid(p) ? p.text : ""; } catch (e) { return ""; } };
  const setText = (p, t) => { if (valid(p) && p.text !== t) p.text = t; };
  const players = (scope) => byClass(scope, "ShowRankBarebonesTopbarPlayer").concat(byClass(scope, "CitadelHudTopBarPlayer"));

  const parseNetworth = (s) => {
    const m = String(s || "").replace(/<[^>]*>/g, "").replace(/,/g, "").toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)\s*([km])?/);
    const n = m ? parseFloat(m[1]) : 0;
    if (!(n > 0)) return 0;
    return m[2] === "k" ? n * 1e3 : m[2] === "m" ? n * 1e6 : n;
  };

  const teamNetworth = (label, teamId) => {
    let total = parseNetworth(text(label));
    if (total > 0) return total;
    for (const p of players(find(root, teamId))) {
      total += parseNetworth(text(find(p, "HiddenGoldValue") || find(p, "SoulsValue")));
    }
    return total;
  };

  const updateUltCooldowns = (all) => {
    for (const p of all) {
      const hidden = find(p, "UltimateCooldownTextHidden");
      const shown = find(p, "UltimateCooldownTextShown");
      if (!valid(hidden) || !valid(shown)) continue;
      const cd = parseFloat(text(hidden));
      setText(shown, cd > 0 ? String(Math.floor(cd + 1)) : "");
    }
  };

  const updateNicknames = (all) => {
    for (const p of all) {
      const always = find(p, "AlwaysPlayerName");
      if (!valid(always)) continue;
      const raw = text(always);
      if (raw && raw !== "{s:player_name}") continue;
      const name = text(find(p, "PlayerName"));
      if (name && name !== "{s:player_name}") always.text = name;
    }
  };

  const updateSoulDifference = () => {
    const urn = find(root, "UrnTracker");
    if (!valid(urn)) return;
    const friendly = teamNetworth(find(root, "TeamScoreFriendlyLabel"), "TeamFriendly");
    const enemy = teamNetworth(find(root, "TeamScoreEnemyLabel"), "TeamEnemy");
    if (friendly <= 0 && enemy <= 0) return;

    const higher = Math.max(friendly, enemy);
    let pct = ((higher - Math.min(friendly, enemy)) / higher) * 100;
    if (friendly < enemy) pct = -pct;

    const parts = text(find(root, "GameTime")).split(":");
    const minutes = parts.length === 2 ? ((parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0)) / 60 : 0;
    const threshold = minutes < 15 ? 15 : 10;
    const mood = pct >= threshold ? "good" : pct <= -threshold ? "bad" : "neutral";

    urn.SetHasClass("good", mood === "good");
    urn.SetHasClass("bad", mood === "bad");
    urn.SetHasClass("neutral", mood === "neutral");
    urn.SetHasClass("show", true);
    setText(find(urn, "UrnTrackerLabel"), (pct > 0 ? "+" : "") + pct.toFixed(1) + "%");
  };

  const tick = () => {
    if (!valid(root)) return;
    try {
      const all = players(root);
      updateUltCooldowns(all);
      updateNicknames(all);
      updateSoulDifference();
    } catch (e) {
      $.Msg("[SR-QOL] tick error: " + e);
    }
    $.Schedule(TICK_SECONDS, tick);
  };

  tick();
})();
