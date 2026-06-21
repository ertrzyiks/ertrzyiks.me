# Implementation Plan

Prioritized list of items yet to be implemented or fixed. Check specs/* for behavioral contracts.

## Completed

- [x] **Fix `World.tileBySection(name)`** — now finds tile by sectionName. Tests passing.
- [x] **Fix `Movable.step(cost)`** — now subtracts cost from movementPoints. Tests passing.
- [x] **Fix `Explorer.takeActions()`** — now checks `canMove()` before dispatching Move. Tests passing.
- [x] **Fix `World.unitsOf(player)`** — now filters by owner id. Tests passing.
- [x] **Unit ownership** — `UnitPosition` carries `owner: Player`; reducer stores it on Spawn.
- [x] **Replenishment on turn start** — reducer calls `replenish()` on all units belonging to the current player at StartTurn.
- [x] **Fog of war** — `Sightful` mixin, `revealedTiles` per player in State, hex fog Graphics layer in renderer. Tests passing.
- [x] **Wolf unit** — `Wolf = Sightful(Movable(Damageable(Unit, 15), 2), 1)`. Tests passing.
- [x] **Stage 1 scenario (partial)** — Scenario spawns Whirley + 3 wandering Wolves; board1.json has `spawn_a`, `wolf_1/2/3`. Human turn auto-passes (no input yet).
- [x] **Unit tests** — 79 tests across grid helpers, Sightful, Movable, reducer, World, PlayerStore, Explorer, Wolf.

---

## Stage 1 — The Wreck (make it playable)

Priority: highest — entry point for everything else.

- [ ] **Add `goal` section to board1.json** — add `sectionName: "village"` to the tile at the far right grass edge. Stage 1 win requires reaching this tile.
- [ ] **Wolf Pack Leader unit** — `PackLeader = Sightful(Movable(Damageable(Unit, 20), 2), 2)`. Stronger than a follower, initiates pack.
- [ ] **Wolf Pack Follower unit** — rename/refactor current `Wolf` to `PackFollower`. Follows Pack Leader rather than wandering.
- [ ] **Pack Leader AI** — `PackLeaderBehavior`: wanders randomly (no backtracking), attacks adjacent non-wolf units. Does NOT target player. See `specs/06-enemy-ai.md`.
- [ ] **Pack Follower AI** — `PackFollowerBehavior`: moves toward the Pack Leader's current position each turn using shortest-path logic; stays if already adjacent; attacks adjacent non-wolf units. See `specs/06-enemy-ai.md`.
- [ ] **Pack dissolution on leader death** — when Pack Leader unit is removed from state, all associated Pack Followers switch to wanderer movement. See `specs/06-enemy-ai.md`.
- [ ] **Wanderer NPC unit** — non-combat unit, cannot be attacked. `Wanderer = Sightful(Movable(Unit, 3), 2)`. No Damageable mixin.
- [ ] **Flee AI behavior** — `FleeBehavior`: each turn moves in direction maximizing distance from nearest player unit; stays if no move increases distance. See `specs/06-enemy-ai.md`.
- [ ] **Update Stage 1 scenario** — spawn: Whirley at `spawn_a`, 1 PackLeader at `wolf_leader`, 2 PackFollowers at `wolf_1/wolf_2`, Wanderer at `wanderer_spawn`. Board sections need updating.
- [ ] **Win condition check after Move** — after every Move, check if moved unit's tile sectionName matches stage's goal section; emit `GameEvent.GameEnd { outcome: "win" }`. See `specs/05-win-lose-conditions.md`.
- [ ] **Lose condition check after damage** — after TakeDamage leaves player's unit at ≤ 0 HP, emit `GameEvent.GameEnd { outcome: "lose" }`. See `specs/05-win-lose-conditions.md`.
- [ ] **`GameEvent.GameEnd` with outcome field** — extend `GameEndEvent` to carry `outcome: "win" | "lose"`.
- [ ] **Terminal state enforcement** — after GameEnd, block all further player and AI actions.
- [ ] **Player input — click-to-move** — clicking a hex dispatches `PlayerAction.Move` for the selected human unit. Guard against clicks during animations and enemy turn. See `specs/03-player-input.md`.
- [ ] **Unit selection** — clicking a friendly unit selects it; subsequent hex clicks operate on selected unit. See `specs/03-player-input.md`.
- [ ] **Highlight valid moves** — after selection, highlight adjacent hexes that are in-bounds, unoccupied, and within movement budget. See `specs/03-player-input.md`.
- [ ] **End-turn button** — UI button dispatches `PlayerAction.EndTurn` for the human player. Human currently auto-passes; must become explicit. See `specs/03-player-input.md`.
- [ ] **Stage 1 narrative events** — trigger dialog at: Turn 1 start, Whirley within sight range of Wanderer, Whirley reaches village, Whirley defeated. See `specs/09-stage-1.md`.
- [ ] **Dialog component** — renders speaker + text lines, pauses all game input, advances on click, resumes game on last line. See `specs/07-narrative-events.md`.
- [ ] **Turn counter** — track current turn number in State; increment on each StartTurn. Required for turn-N narrative triggers.
- [ ] **Occupied-tile enforcement** — reject Move if destination hex is occupied. See `specs/02-movement-system.md`.

---

## Stage 2 — The Gate

Depends on: Stage 1 playable, combat system, bandit unit.

- [ ] **Bandit unit** — `Bandit = Sightful(Movable(Damageable(Unit, 25), 2), 1)` with `damage = 8`. Higher HP and damage than wolves. See `specs/10-stage-2.md`.
- [ ] **Damaging mixin** — give units a `damage` value used when computing `TakeDamage` events. Wolves and bandits deal different amounts.
- [ ] **Player attack action** — clicking an adjacent enemy unit during the human turn dispatches `PlayerAction.Attack`. See `specs/03-player-input.md`.
- [ ] **`PlayerAction.Attack` → `GameEvent.TakeDamage`** — implement in `createPlayerStore`; compute damage from attacker's unit type. See `specs/04-combat-system.md`.
- [ ] **Enemy attack → `GameEvent.TakeDamage`** — bandit (and wolf) adjacent attack emits TakeDamage against the player unit. See `specs/04-combat-system.md`.
- [ ] **Death handling in reducer** — TakeDamage leaving unit at ≤ 0 HP removes it from `state.units`; triggers win/lose condition check. See `specs/04-combat-system.md`.
- [ ] **Attack action charge** — each unit has one attack per turn; replenished at turn start; blocked when exhausted. See `specs/04-combat-system.md`.
- [ ] **Seeker AI behavior** — `SeekerBehavior`: moves toward nearest player unit each turn, attacks when adjacent. Used by bandits. See `specs/06-enemy-ai.md`.
- [ ] **Board for Stage 2** — road map (~8×6) with bandits between entrance and gate. Sections: `spawn_a`, `gate` (goal), `bandit_1`, `bandit_2`, `bandit_3`, `wanderer_spawn`. See `specs/10-stage-2.md`.
- [ ] **Stage 2 scenario** — loads Stage 2 board; spawns Whirley + 3 Bandits + Wanderer; uses Stage 2 narrative script. See `specs/10-stage-2.md`.
- [ ] **Stage 2 narrative events** — dialog at: Turn 1 (3 lines), Turn 3 (2 lines), Whirley within sight range of Wanderer, Whirley reaches gate (2 lines), Whirley defeated. See `specs/10-stage-2.md`.
- [ ] **Stage progression** — after Stage 1 win GameEnd event, load Stage 2. See `specs/08-stage-system.md`.
- [ ] **Stage reset on lose** — after lose GameEnd, reload current stage: clear units, reset fog, reset turn counter. See `specs/08-stage-system.md`.

---

## Stage 3 — Let's Be Reasonable

Depends on: Stage 2 fully playable, Bandit Captain unit.

- [ ] **Bandit Captain unit** — `BanditCaptain = Sightful(Movable(Damageable(Unit, 40), 2), 2)` with `damage = 12`. Visually distinct from standard bandits. See `specs/11-stage-3.md`.
- [ ] **Board for Stage 3** — camp map with Wanderer cornered at far end. Sections: `spawn_a`, `campfire` (goal), `captain_spawn`, `bandit_4`, `bandit_5`, `bandit_6`, `wanderer_spawn`. Wanderer spawn is enclosed on three sides. See `specs/11-stage-3.md`.
- [ ] **Stage 3 scenario** — loads Stage 3 board; spawns Whirley + Bandit Captain + 3 Bandits + Wanderer; uses Stage 3 narrative script. See `specs/11-stage-3.md`.
- [ ] **Stage 3 narrative events** — dialog at: Turn 1 (3 lines), Turn 4, Bandit Captain defeated (2 lines), Wanderer sight range, Whirley reaches campfire (4 lines), Whirley defeated. See `specs/11-stage-3.md`.
- [ ] **Game completed state** — after Stage 3 win, no further stages load; completed state blocks all gameplay input. See `specs/08-stage-system.md`.
- [ ] **Stage progression Stage 2 → Stage 3** — after Stage 2 win, load Stage 3. See `specs/08-stage-system.md`.
