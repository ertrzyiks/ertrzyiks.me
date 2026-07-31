import { Terrain, type Board } from "../core/board";
import type { StoreProxy } from "../core/store";
import type { GameEvent } from "../core/game_event";
import type { State } from "../core/world";
import type { PlayerAction } from "../core/player_action";

/**
 * A single flat row with every section any Stage 1/2/3 (or Stage 1/2/3
 * equivalent, e.g. an editor-resolved `StageDefinition`) definition under
 * test might reference, so they can all spawn onto one shared board. `World.
 * tileBySection` falls back to tiles[0] for an unknown name, so every section
 * used by a caller must be a real, distinct tile or a bug there would go
 * unnoticed. Shared by `scenario.test.ts` and `stage_editor/resolver.test.ts`,
 * which assert the same spawn/win-condition behavior from two different
 * sources of `StageDefinition` (hand-written factories vs. the resolver).
 */
export function makeBoard(): Board {
  const sections = [
    "spawn_a",
    "spawn_b",
    "wolf_1",
    "wolf_2",
    "wolf_3",
    "village",
    "bandit_1",
    "bandit_2",
    "bandit_3",
    "gate",
    "wanderer_spawn",
    "bandit_4",
    "bandit_5",
    "bandit_6",
    "captain_spawn",
    "campfire",
  ];
  return {
    rows: 1,
    cols: sections.length,
    tiles: sections.map((sectionName, x) => ({
      x,
      y: 0,
      type: Terrain.WATER,
      textureName: "grass",
      sectionName,
    })),
  };
}

/** Flush the microtask-based `Observable` pipeline (shared/observable.ts) that carries turn transitions between Scenario and Game. */
export function flush(): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A minimal `StoreProxy` double with empty state — enough to construct a
 * `Behavior` and inspect what it was built with (e.g. a protected field via
 * an `as unknown as {...}` cast) without wiring a real `Store`/`Game`. Not
 * for exercising behavior *logic* (movement, targeting): those live in
 * `core/player/*.test.ts` with populated state via `core/grid/test_helpers`.
 */
export function makeStoreDouble(): StoreProxy<GameEvent, State, PlayerAction> {
  const state = { units: [], allUnits: [], tiles: [], cols: 5, rows: 5 } as unknown as State;
  return {
    getState: () => state,
    dispatch: () => {},
    subscribe: () => {},
  } as unknown as StoreProxy<GameEvent, State, PlayerAction>;
}
