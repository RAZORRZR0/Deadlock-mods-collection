(() => {
  "use strict";
  const api = $.DjinnMark;
  const root = $.GetContextPanel();
  if (root.__djinnPublisher) root.__djinnPublisher.stop();
  const relay = $.DjinnMarkCreateRelay();
  let stopped = false;
  let effects = null;
  let namePanel = null;
  let lastKey = "";
  let lastCount = 0;
  const stop = () => {
    stopped = true;
    relay.stop();
  };
  root.__djinnPublisher = { stop };
  const publish = (key, list) => {
    const now = Date.now();
    relay.send({ magic_word: api.magic, version: api.version, key, effects: list,
      updated_at: now, expires_at: now + 3000 });
  };
  // [cssClass, stacks (0 = no number), clip] per whitelisted modifier on this healthbar.
  const scan = () => {
    const found = [];
    if (!effects.FindChildrenWithClassTraverse("statusEffect").length) return found;
    for (const cls of api.classes) {
      let entry = null;
      for (const mark of effects.FindChildrenWithClassTraverse(cls)) {
        if (!api.valid(mark) || mark.visible === false) continue;
        const label = api.find(mark, "stacks");
        const count = api.valid(label) ? Number(String(label.text).trim()) : 0;
        const stacks = Number.isInteger(count) && count > 0 ? count : 0;
        if (entry && stacks < entry[1]) continue;
        const border = api.find(mark, "StatusEffectsBorder");
        entry = [cls, stacks, api.valid(border) ? api.readClip(border.style.clip) : null];
      }
      if (entry) found.push(entry);
      if (found.length >= api.slots) break;
    }
    return found;
  };
  const tick = () => {
    if (stopped) return;
    if (!api.valid(root)) { stop(); return; }
    try {
      // Both overlays own these descendants. Never search another unit's subtree.
      if (!api.valid(effects)) effects = api.find(root, "StatusEffects");
      if (!api.valid(namePanel)) namePanel = api.find(root, "name");
      const key = api.readName(namePanel, "{s:name}");
      const found = key && api.valid(effects) ? scan() : [];
      if (lastKey && lastKey !== key && lastCount > 0) publish(lastKey, []);
      // Refresh active snapshots for late subscribers and expire missing sources.
      if (key && (found.length > 0 || (lastKey === key && lastCount > 0))) publish(key, found);
      lastKey = key;
      lastCount = found.length;
      $.Schedule(!api.valid(effects) || !key ? 1.0 : lastCount > 0 ? 0.05 : 0.4, tick);
    } catch (error) {
      $.Schedule(1.0, tick);
    }
  };
  $.Schedule(0.1, tick);
})();
