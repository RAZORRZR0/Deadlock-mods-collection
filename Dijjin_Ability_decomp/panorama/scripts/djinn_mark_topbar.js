(() => {
  "use strict";
  const api = $.DjinnMark;
  const root = $.GetContextPanel();
  if (root.__djinnConsumer) root.__djinnConsumer.stop();
  const allowed = new Set(api.classes);
  const records = Object.create(null);
  let stopped = false;
  let hero = null;
  let player = null;
  let slots = [];
  let active = 0;
  const cacheSlots = () => {
    slots = [];
    for (let i = 0; i < api.slots; i++) {
      const panel = api.find(root, "TopbarAbilityMark" + i);
      const label = api.find(panel, "TopbarAbilityMarkStacks");
      const border = api.find(panel, "StatusEffectsBorder");
      if (!api.valid(label) || !api.valid(border)) { slots = []; return; }
      slots.push({ panel, label, border, cls: "", text: "", clip: undefined });
    }
  };
  const render = () => {
    if (stopped || !api.valid(root)) return;
    if (!slots.length || !api.valid(slots[0].panel)) cacheSlots();
    // Stock layout has #HeroName/#PlayerName; ShowRank's layout only keeps the classes.
    if (!api.valid(hero)) hero = api.find(root, "HeroName") || root.FindChildrenWithClassTraverse("HeroName")[0];
    if (!api.valid(player)) player = api.find(root, "PlayerName") || root.FindChildrenWithClassTraverse("PlayerName")[0];
    if (!slots.length) return;
    const now = Date.now();
    for (const key of Object.keys(records)) {
      if (records[key].expires_at <= now) delete records[key];
    }
    const record = records[api.readName(hero, "{s:hero_name}")] ||
      records[api.readName(player, "{s:player_name}")];
    const list = !root.BHasClass("Dead") && record ? record.effects : [];
    active = list.length;
    slots.forEach((slot, i) => {
      const entry = list[i];
      const cls = entry ? entry[0] : "";
      if (cls !== slot.cls) {
        if (slot.cls) slot.panel.RemoveClass(slot.cls);
        if (cls) slot.panel.AddClass(cls);
        slot.panel.SetHasClass("TopbarAbilityMarkVisible", !!cls);
        slot.cls = cls;
      }
      const text = entry && entry[1] > 0 ? String(entry[1]) : "";
      if (text !== slot.text) { slot.label.text = text; slot.text = text; }
      const clip = entry ? api.readClip(entry[2]) : null;
      if (clip !== slot.clip) {
        slot.border.style.clip = clip || "radial(50% 50%, 0deg, 0deg)";
        slot.border.style.visibility = clip ? "visible" : "collapse";
        slot.clip = clip;
      }
    });
  };
  const validEntry = entry => Array.isArray(entry) && entry.length === 3 && allowed.has(entry[0]) &&
    Number.isInteger(entry[1]) && entry[1] >= 0 && (entry[2] === null || typeof entry[2] === "string");
  const receive = message => {
    let record;
    try { record = typeof message === "string" ? JSON.parse(message) : message; }
    catch (error) { return false; }
    if (!record || record.magic_word !== api.magic || record.version !== api.version ||
        typeof record.key !== "string" || !record.key || api.normalize(record.key) !== record.key ||
        !Array.isArray(record.effects) || record.effects.length > api.slots || !record.effects.every(validEntry) ||
        !Number.isFinite(record.updated_at) || !Number.isFinite(record.expires_at) ||
        record.updated_at > Date.now() || record.expires_at <= Date.now()) return false;
    const previous = records[record.key];
    if (previous && previous.updated_at > record.updated_at) return false;
    records[record.key] = record;
    render();
    return false; // Do not consume a channel shared with other mods/cards.
  };
  const listener = $.RegisterForUnhandledEvent(api.channel, receive);
  const stop = () => {
    stopped = true;
    $.UnregisterForUnhandledEvent(api.channel, listener);
  };
  const tick = () => {
    if (stopped) return;
    if (!api.valid(root)) { stop(); return; }
    render();
    $.Schedule(active > 0 ? 0.05 : 0.4, tick);
  };
  root.__djinnConsumer = { stop };
  $.DjinnMarkPlayerLoaded = render;
  $.Schedule(0.15, tick);
})();
