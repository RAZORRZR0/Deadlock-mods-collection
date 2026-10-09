(() => {
  "use strict";
  const valid = panel => !!panel && panel.IsValid();
  const find = (panel, id) => valid(panel) ? panel.FindChildTraverse(id) : null;
  const normalize = value => {
    const name = String(value || "").replace(/\s+/g, " ").trim();
    return !name || name === "#" || /[{}%]/.test(name) ? "" : name.toLowerCase();
  };
  const readName = (panel, token) => {
    if (!valid(panel)) return "";
    const text = normalize(panel.text);
    if (text && text[0] !== "#") return text;
    const localized = normalize($.Localize(token, panel));
    return localized && localized[0] !== "#" ? localized : "";
  };
  // Engine-owned countdown mask; do not guess the ability's duration.
  const readClip = value => {
    const match = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(-?\d+(?:\.\d+)?)deg\s*\)$/.exec(String(value || ""));
    const angle = match ? Number(match[1]) : NaN;
    return Number.isFinite(angle) && angle >= -360 && angle <= 0 ?
      "radial(50% 50%, 0deg, " + angle + "deg)" : null;
  };
  // m_strSmallIconCssClass of healthbar modifiers that hero abilities put on other heroes
  // (abilities/scripts/abilities.vdata). Stock unit_status_icons.vcss_c paints each class.
  const classes = [
    "ability_ice_dome", "afterburn_dot", "asleep", "bleeding_buildup",
    "blood_shard", "bullet_armor_reduction", "disarm_proc", "escalating_exposure",
    "glitched", "immobilize", "immobilize_proc", "lifesteal",
    "marksman", "modifier_cadence_crescendo_post_aoe", "modifier_pocket_affliction", "modifier_viper_debuffdagger",
    "modifier_viper_venom", "modifier_viper_venom_buildup", "mokrill_scorn", "napalm_debuff",
    "sand_phantom_passive_victim", "silence_proc", "slowed", "stunned",
    "tech_armor_reduction", "trapper_web", "viper_petrify", "viscous_goo_grenade"
  ];
  $.DjinnMark = { valid, find, normalize, readName, readClip, classes,
    channel: "ClientUI_FireOutput", magic: "DJINN_MARK_UPDATE", version: 3, slots: 4 };
})();
