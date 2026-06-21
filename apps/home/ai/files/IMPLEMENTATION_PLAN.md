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
- [x] **Stage 1 scenario (partial)** — Scenario spawns Whirley + a wolf pack (1 PackLeader at `wolf_1`, 2 PackFollowers at `wolf_2/3`). Human turn auto-passes (no input yet).
- [x] **Wolf Pack Leader / Follower units** — `PackLeader = Leader(Sightful(Movable(Damageable(Unit,20),2),2))`, `PackFollower = Follower(Sightful(Movable(Damageable(Unit,15),2),1))` in `main/units/wolf.ts`. Core role mixins `Leader`/`Follower` + `isWolf`/`isPackLeader`/`isPackFollower` guards in `core/units/pack.ts`. (Old generic `Wolf` removed — single source of truth.)
- [x] **Movement AI helpers** — `core/player/movement.ts`: `createMoveContext` (bounds from actual tiles, occupancy from units), `validDirections`, `directionToward`, `directionAway`, `randomValidDirection` (injectable rng, no-backtrack). Reusable by all enemy behaviors.
- [x] **Pack movement AI + dissolution** — `core/player/pack_behavior.ts` `PackBehavior`: leader wanders (random valid dir, avoids backtracking across turns via `PackMemory`), followers step toward the living leader (stay if adjacent), and when no living leader is present the pack dissolves to wandering. Leader-first action order. Wired into `main/scenario.ts`. **Attack-on-adjacency is intentionally NOT emitted** — it depends on the combat system (TakeDamage), a later increment; see Stage 2 list.
- [x] **Fix `State.players` type** — was `Array<{id;name}>`, causing pre-existing `tsc`/`astro check` type errors in `player_store.test.ts` and `reducers/index.test.ts` (currentPlayer is `Player`, needs `color`). Now `Array<Player>`. Build + typecheck clean.
- [x] **Combat system core (spec 04)** — `Damaging(Base, damage, attacksPerTurn=1)` mixin in `core/units/damaging.ts` (replaces the old unused `IDamaging` interface) gives a fixed `damage`, attack-charge budget (`canAttack`/`useAttack`), and `replenish()` chaining. `isDamaging`/`isDamageable` guards. Reducer handles `GameEventType.TakeDamage`: spends the attacker's charge, applies `takeDamage`, and removes the resolved target if `!isAlive()` (only the target — bystanders reading 0 HP pre-replenish are left alone). `player_store` translates `PlayerAction.Attack` → `TakeDamage` (resolves target by hex from the full roster, rejects friendly-fire / non-adjacent / no-charge). Tests passing.
- [x] **Proxy exposes `allUnits`** — `createPlayerStore.proxyState` now adds `allUnits` (full roster) while keeping `units` filtered to the owner. `State.allUnits?` is optional (base store leaves it undefined). `createMoveContext` uses `allUnits ?? units` for occupancy so a wolf will not step onto the (enemy) Hero. Unblocks Seeker/Flee AI. Single source of truth, no adapter.
- [x] **Pack attack-on-adjacency (spec 06)** — `PackBehavior.tryAttack` makes each wolf bite an adjacent non-wolf living unit after moving (re-reads position post-move; reads `allUnits` to see the Hero). Dissolved followers keep their bite.
- [x] **Hero + wolf combat stats** — Hero is now `Damageable(30) + Damaging(10)`; PackLeader `Damaging(7)`, PackFollower `Damaging(5)`. HP/damage are not fixed by specs — chosen so wolves < bandits(8). Renderer (`shared/game_world.ts`) tears down a unit sprite on `TakeDamage` when its unit left `state.units`.
- [x] **Unit tests** — 128 tests. Added `core/units/damaging.test.ts`; expanded reducer (`TakeDamage`), `player_store` (`Attack` + `allUnits`), `pack_behavior` (attack), `wolf` (damage) tests.

---

## Architectural notes for future work

- **`allUnits` is how a behavior sees enemies.** The per-player proxy exposes `state.allUnits` (full roster) plus `state.units` (this player only). Seeker (bandit) and Flee (Wanderer) behaviors should read `allUnits` to find player units — same pattern `PackBehavior.tryAttack`/`createMoveContext` already use. Raw (unproxied) state leaves `allUnits` undefined, so always `allUnits ?? units`.
- **Occupancy is enforced for AI movers only (so far).** `createMoveContext` keeps AI off occupied tiles (all units). The reducer still does NOT reject a `Move` onto an occupied hex — once human click-to-move exists, add that guard in the reducer against ALL units so it covers every mover (see "Occupied-tile enforcement").
- **Combat removes units but nothing ends the game yet.** `TakeDamage` removing the Hero just leaves the human with no units (turn auto-passes, no crash). Win/lose detection + `GameEnd { outcome }` + terminal state is the next increment — now fully unblocked by combat.
- **One step per unit per turn.** Both `Explorer` and `PackBehavior` dispatch a single Move per unit even when the unit has >1 movement point. Matches spec wording ("moves one step") but means multi-point budgets are underused. Revisit if a behavior needs to close distance faster.

## Stage 1 — The Wreck (make it playable)

Priority: highest — entry point for everything else.

- [x] **Wolf Pack Leader unit** — done (see Completed). Stats `Damageable 20 / move 2 / sight 2`.
- [x] **Wolf Pack Follower unit** — done; `Wolf` renamed to `PackFollower`.
- [x] **Pack Leader AI** — done (wander, no-backtracking, attack-on-adjacency).
- [x] **Pack Follower AI** — done (step toward leader, stay if adjacent, `directionToward` handles blocked shortest path, attack-on-adjacency).
- [x] **Pack dissolution on leader death** — done; `PackBehavior` treats a missing/non-alive leader as dissolved → followers wander.
- [ ] **Add `goal` section to board1.json** — add `sectionName: "village"` to the tile at the far right grass edge. Stage 1 win requires reaching this tile.
- [ ] **Wanderer NPC unit** — non-combat unit, cannot be attacked. `Wanderer = Sightful(Movable(Unit, 3), 2)`. No Damageable mixin.
- [ ] **Flee AI behavior** — `FleeBehavior` using `directionAway` (already implemented in `movement.ts`): each turn moves to maximize distance from nearest player unit; stays if no move increases distance. **BLOCKED on the proxy exposing enemy units** — see Architectural notes above. See `specs/06-enemy-ai.md`.
- [ ] **Finish Stage 1 scenario** — add Wanderer spawn (needs `wanderer_spawn` section) and a dedicated neutral player for it. Pack already wired. Board section renaming (`wolf_leader`) optional — current `wolf_1/2/3` work fine.
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

- [ ] **Bandit unit** — `Bandit = Damaging(Sightful(Movable(Damageable(Unit, 25), 2), 1), 8)`. Higher HP and damage than wolves. Use the `Damaging` mixin (now built). See `specs/10-stage-2.md`.
- [x] **Damaging mixin** — `Damaging(Base, damage, attacksPerTurn=1)` in `core/units/damaging.ts`. Wolves/Hero already use it.
- [ ] **Player attack action** — clicking an adjacent enemy unit during the human turn dispatches `PlayerAction.Attack { unit, position }`. Translation already exists; this is the UI/input half. See `specs/03-player-input.md`.
- [x] **`PlayerAction.Attack` → `GameEvent.TakeDamage`** — done in `createPlayerStore` (resolves target by hex, validates friendly-fire/adjacency/charge).
- [x] **Enemy attack → `GameEvent.TakeDamage`** — wolves emit it via `PackBehavior.tryAttack`; bandits will reuse the same `Attack` action.
- [x] **Death handling in reducer** — `TakeDamage` removes the resolved target when `!isAlive()`. Win/lose check is a separate (now unblocked) item.
- [x] **Attack action charge** — `Damaging` carries one attack/turn (configurable), replenished at turn start, blocked when exhausted.
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
