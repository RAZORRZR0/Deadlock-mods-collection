# Context Map

## Contexts

- [HP Colors](./hp_colors/CONTEXT.md) — defines the player-facing language for the HP Colors Deadlock mod: healthbar coloring, presets, hero targeting, and runtime visual affordances.
- [Poker / Bluff Deck](./poker/CONTEXT.md) — chat-authoritative Escape-menu card minigames.
- **ShowRank + Recent Purchases (No Missing)** (`showrank_recent_purchases/`) — merged Panorama mod resolving topbar layout collisions between ShowRank rank badge overlays and ByteNode's shop history and floating live purchase notifications, packaged under the `panorama/` VPK root.

## Relationships

- **HP Colors → Deadlock HUD**: HP Colors augments the in-game HUD vocabulary with configurable health-state visuals, while Deadlock remains the source of hero, team, and healthbar meaning.
- **HP Colors → Preset workflows**: HP Colors presets can be authored in the in-game Anita UI or external builder workflows, but both describe the same player-facing preset concepts.
- **ShowRank + Recent Purchases → Topbar HUD**: Modifies `citadel_hud_top_bar_player.xml` and `citadel_hud_hero_shop.xml` to simultaneously display live rank predictions and live floating purchase notifications without missing alerts.
