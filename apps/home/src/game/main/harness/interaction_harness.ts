import { Terrain, type Board } from "../../core/board";
import { PlayerColor } from "../../core/player/player";
import { PlayerActionType } from "../../core/player_action";
import { Behavior } from "../../core/player/behavior";
import { Unit, Damageable } from "../../core/units";
import { Hero } from "../units";
import type { StageDefinition, UnitSpawn } from "../stages/stage";
import type { NarrativeScript } from "../../core/narrative";

// Deliberately minimal (docs/adr/0001): three tiles in a row plus three hexes
// on the row below — "harness_adjacent_enemy_spot" (adjacent to
// "harness_start" itself) and "harness_enemy_spot"/"harness_enemy_spot_2"
// (adjacent to "harness_next") — one Hero, no enemies by default. Enough to
// drive the real click -> select -> click -> move path through MainWorld
// without mounting Stage 1's wolves or narrative. The second row exists only
// so an opt-in enemy (or two) has a hex adjacent to a first-row tile to stand
// on — a 1-row board can't express that adjacency at all.
export function createHarnessBoard(): Board {
  return {
    rows: 2,
    cols: 3,
    tiles: [
      { x: 0, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "harness_start" },
      { x: 1, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "harness_next" },
      { x: 2, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "harness_far" },
      { x: 0, y: 1, type: Terrain.WATER, textureName: "grass", sectionName: "harness_adjacent_enemy_spot" },
      { x: 1, y: 1, type: Terrain.WATER, textureName: "grass", sectionName: "harness_enemy_spot_2" },
      { x: 2, y: 1, type: Terrain.WATER, textureName: "grass", sectionName: "harness_enemy_spot" },
    ],
  };
}

export function createHarnessDefinition(): StageDefinition {
  return {
    player: { id: "human", name: "Harness Hero", color: PlayerColor.BLUE },
    playerSpawns: [{ section: "harness_start", createUnit: () => new Hero() }],
    enemies: [],
    // The far tile, not the middle one: an auto-path move (ADR-0003) that
    // walks the Hero through "harness_next" on its way to "harness_far"
    // shouldn't win the stage the instant it passes over the middle tile.
    winSection: "harness_far",
  };
}

// A plain Damageable target with no movement or attack of its own — this
// harness variant only needs something standing still to attack, never an
// actual acting turn (the auto-attack interaction test resolves entirely
// within the human's own turn, before any enemy turn would run).
const HarnessTarget = Damageable(Unit, 10);

class StationaryBehavior extends Behavior {
  takeActions() {
    this.store.dispatch({ type: PlayerActionType.EndTurn });
  }
}

function withHarnessEnemies(spawns: UnitSpawn[]): StageDefinition {
  return {
    ...createHarnessDefinition(),
    enemies: [
      {
        player: { id: "harness_enemy", name: "Harness Target(s)", color: PlayerColor.RED },
        spawns,
        turnEventName: "harnessEnemyTurn",
        createBehavior: (store) => new StationaryBehavior(store),
      },
    ],
  };
}

// Opt-in (interaction-harness.astro's default stays enemy-free per docs/adr/0001).
// Exists for interaction/auto-attack-move.spec.ts (ADR-0004): "harness_enemy_spot"
// sits adjacent to both "harness_next" and "harness_far", so moving the Hero
// onto either lands it next to exactly one eligible target.
export function createHarnessDefinitionWithEnemy(): StageDefinition {
  return withHarnessEnemies([{ section: "harness_enemy_spot", createUnit: () => new HarnessTarget() }]);
}

// Opt-in (interaction-harness.astro's default stays enemy-free per docs/adr/0001).
// Exists for interaction/auto-attack-choice.spec.ts (ADR-0004): both spots sit
// adjacent to "harness_next", so moving the Hero there lands next to 2
// eligible targets at once — the ambiguous case that must NOT auto-resolve.
export function createHarnessDefinitionWithTwoEnemies(): StageDefinition {
  return withHarnessEnemies([
    { section: "harness_enemy_spot", createUnit: () => new HarnessTarget() },
    { section: "harness_enemy_spot_2", createUnit: () => new HarnessTarget() },
  ]);
}

// Opt-in (interaction-harness.astro's default stays enemy-free per docs/adr/0001).
// Exists for interaction/click-to-attack.spec.ts (issue #219): a bare
// click-to-attack with no preceding move — "harness_adjacent_enemy_spot" sits
// next to "harness_start" itself, unlike the other enemy spots above, which
// only became adjacent after the Hero moved onto "harness_next".
export function createHarnessDefinitionWithAdjacentEnemy(): StageDefinition {
  return withHarnessEnemies([
    { section: "harness_adjacent_enemy_spot", createUnit: () => new HarnessTarget() },
  ]);
}

// Opt-in only (interaction-harness.astro's default stays `[]` per docs/adr/0001
// — most interaction tests want input wiring with nothing else in the way).
// Exists for interaction/move-into-narrative-trigger.spec.ts: Observable.push()
// (shared/observable.ts) notifies subscribers synchronously, so a move that
// steps onto a tileReached section fires this beat's dialog inside the same
// moveUnit() call handleTileClick (main/game_world.ts) is still running —
// regression-testing that requires a real (if minimal) narrative trigger, not
// mounting all of Stage 1's wolves/dialogs the way ADR 0001 explicitly rejected.
export function createHarnessNarrativeScript(): NarrativeScript {
  return [
    {
      id: "harness-reached-next",
      trigger: { kind: "tileReached", playerId: "human", sections: ["harness_next"] },
      lines: [{ text: "You've arrived." }],
    },
  ];
}
