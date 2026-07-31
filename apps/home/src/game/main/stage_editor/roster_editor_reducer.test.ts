import { describe, expect, test } from "vitest";
import { Game } from "../../core/game";
import { Scenario } from "../scenario";
import { makeBoard } from "../test_helpers";
import { resolveStageDefinition } from "./resolver";
import { Terrain, type Board } from "../../core/board";
import {
  createRosterEditorState,
  loadRosterEditorState,
  refreshValidSections,
  rosterEditorReducer,
  toStageRosterData,
  validateAgainstBoard,
  type RosterEditorState,
} from "./roster_editor_reducer";
import { RosterEditorEventType } from "./roster_editor_event";
import type { StageRosterData } from "./stage_roster";

function makeState(overrides: Partial<RosterEditorState> = {}): RosterEditorState {
  return { ...createRosterEditorState(makeBoard()), ...overrides };
}

// Mirrors core/reducers/index.test.ts's playedState() precedent: a shared
// multi-step buildup, since several describes below need "a state with a
// wolves roster already added" as their starting point.
function withWolfRoster(state: RosterEditorState): RosterEditorState {
  return rosterEditorReducer(state, {
    type: RosterEditorEventType.AddEnemyRoster,
    factionKey: "wolves",
    behaviorKey: "Pack",
    turnEventName: "wolfTurn",
  });
}

describe("createRosterEditorState", () => {
  test("derives validSections from the board's tile section names", () => {
    const state = createRosterEditorState(makeBoard());
    expect(state.validSections.has("spawn_a")).toBe(true);
    expect(state.validSections.has("village")).toBe(true);
    expect(state.validSections.has("nowhere")).toBe(false);
  });

  test("starts empty, with no error", () => {
    const state = createRosterEditorState(makeBoard());
    expect(state.playerSpawns).toEqual([]);
    expect(state.enemies).toEqual([]);
    expect(state.winSection).toBe("");
    expect(state.error).toBe(null);
  });
});

describe("loadRosterEditorState", () => {
  test("seeds playerSpawns/enemies/winSection from previously-saved data, and validSections from the board", () => {
    const data: StageRosterData = {
      playerSpawns: [{ section: "spawn_a", unitKey: "Hero" }],
      enemies: [
        {
          factionKey: "wolves",
          behaviorKey: "Pack",
          turnEventName: "wolfTurn",
          spawns: [{ section: "wolf_1", unitKey: "PackLeader" }],
        },
      ],
      winSection: "village",
    };

    const state = loadRosterEditorState(data, makeBoard());

    expect(state.playerSpawns).toEqual(data.playerSpawns);
    expect(state.enemies).toEqual(data.enemies);
    expect(state.winSection).toBe("village");
    expect(state.error).toBe(null);
    expect(state.validSections.has("spawn_a")).toBe(true);
    expect(state.validSections.has("village")).toBe(true);
  });

  test("further dispatches against the loaded state behave exactly like any other state (e.g. duplicate-section rejection)", () => {
    const data: StageRosterData = {
      playerSpawns: [{ section: "spawn_a", unitKey: "Hero" }],
      enemies: [],
      winSection: "",
    };
    const state = loadRosterEditorState(data, makeBoard());

    const rejected = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });

    expect(rejected.playerSpawns).toEqual(data.playerSpawns);
    expect(rejected.error).toMatch(/already assigned/i);
  });
});

describe("refreshValidSections", () => {
  test("picks up a newly-renamed section without touching the rest of the state", () => {
    const withSpawn = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });

    const renamedBoard: Board = {
      rows: 1,
      cols: 1,
      tiles: [
        { x: 0, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "brand_new_section" },
      ],
    };
    const refreshed = refreshValidSections(withSpawn, renamedBoard);

    expect(refreshed.validSections.has("brand_new_section")).toBe(true);
    expect(refreshed.validSections.has("spawn_a")).toBe(false);
    // Renaming a section out from under an existing spawn doesn't retroactively
    // invalidate that spawn — this helper only updates what's *newly* valid to
    // pick, it doesn't re-run user story 12's validation over existing data.
    expect(refreshed.playerSpawns).toEqual(withSpawn.playerSpawns);
    expect(refreshed.error).toBe(withSpawn.error);
  });
});

describe("validateAgainstBoard", () => {
  const board = makeBoard();

  test("passes when every reference still resolves on the given board", () => {
    let state = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    state = withWolfRoster(state);
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "wolf_1",
      unitKey: "PackLeader",
    });
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.SetWinSection,
      section: "village",
    });

    expect(validateAgainstBoard(state, board)).toBe(null);
  });

  test("catches a player spawn whose section was renamed out from under it after refreshValidSections lets the rename through", () => {
    const withSpawn = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    const renamedBoard: Board = {
      ...board,
      tiles: board.tiles.map((tile) =>
        tile.sectionName === "spawn_a" ? { ...tile, sectionName: "renamed" } : tile
      ),
    };

    // refreshValidSections (the live picker's view) doesn't itself catch this...
    const refreshed = refreshValidSections(withSpawn, renamedBoard);
    expect(refreshed.error).toBe(null);
    // ...validateAgainstBoard (the save-time gate) does.
    expect(validateAgainstBoard(refreshed, renamedBoard)).toMatch(
      /player spawn references section "spawn_a".*no longer exists/i
    );
  });

  test("catches a stale enemy roster spawn section", () => {
    let state = withWolfRoster(makeState());
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "wolf_1",
      unitKey: "PackLeader",
    });
    const renamedBoard: Board = {
      ...board,
      tiles: board.tiles.map((tile) =>
        tile.sectionName === "wolf_1" ? { ...tile, sectionName: "renamed" } : tile
      ),
    };

    expect(validateAgainstBoard(state, renamedBoard)).toMatch(
      /wolves.*roster spawn references section "wolf_1".*no longer exists/i
    );
  });

  test("catches a stale win section", () => {
    const state = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.SetWinSection,
      section: "village",
    });
    const renamedBoard: Board = {
      ...board,
      tiles: board.tiles.map((tile) =>
        tile.sectionName === "village" ? { ...tile, sectionName: "renamed" } : tile
      ),
    };

    expect(validateAgainstBoard(state, renamedBoard)).toMatch(/win section "village".*no longer exists/i);
  });

  test("an empty winSection is not itself a validation failure", () => {
    expect(validateAgainstBoard(makeState(), board)).toBe(null);
  });
});

describe("AddPlayerSpawn", () => {
  test("appends a player spawn for a known, unclaimed section", () => {
    const state = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    expect(state.playerSpawns).toEqual([{ section: "spawn_a", unitKey: "Hero" }]);
    expect(state.error).toBe(null);
  });

  test("rejects a section the board doesn't have (user story 12), leaving data unchanged", () => {
    const before = makeState();
    const state = rosterEditorReducer(before, {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "nowhere",
      unitKey: "Hero",
    });
    expect(state.playerSpawns).toEqual([]);
    expect(state.error).toMatch(/unknown section/i);
  });

  test("rejects a section already claimed by another spawn (user story 13)", () => {
    const withSpawn = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    const state = rosterEditorReducer(withSpawn, {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    expect(state.playerSpawns).toHaveLength(1);
    expect(state.error).toMatch(/already assigned/i);
  });
});

describe("RemovePlayerSpawn", () => {
  test("removes the spawn at the given index and clears the section for reuse", () => {
    const withSpawn = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    const removed = rosterEditorReducer(withSpawn, {
      type: RosterEditorEventType.RemovePlayerSpawn,
      index: 0,
    });
    expect(removed.playerSpawns).toEqual([]);

    // The section is free again — re-adding it must not be rejected as a duplicate.
    const readded = rosterEditorReducer(removed, {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    expect(readded.error).toBe(null);
    expect(readded.playerSpawns).toEqual([{ section: "spawn_a", unitKey: "Hero" }]);
  });
});

describe("AddEnemyRoster / AddEnemyRosterSpawn", () => {
  test("adds an empty roster, then spawns into it by index", () => {
    const withRoster = withWolfRoster(makeState());
    expect(withRoster.enemies).toEqual([
      { factionKey: "wolves", behaviorKey: "Pack", turnEventName: "wolfTurn", spawns: [] },
    ]);

    const withSpawn = rosterEditorReducer(withRoster, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "wolf_1",
      unitKey: "PackLeader",
    });
    expect(withSpawn.enemies[0].spawns).toEqual([{ section: "wolf_1", unitKey: "PackLeader" }]);
    expect(withSpawn.error).toBe(null);
  });

  test("rejects a spawn targeting a roster index that doesn't exist", () => {
    const state = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "wolf_1",
      unitKey: "PackLeader",
    });
    expect(state.error).toMatch(/no enemy roster/i);
  });

  test("rejects a section already claimed by a player spawn (cross-roster duplicate check)", () => {
    const withPlayerSpawn = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    const withRoster = withWolfRoster(withPlayerSpawn);
    const state = rosterEditorReducer(withRoster, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "spawn_a",
      unitKey: "PackLeader",
    });
    expect(state.enemies[0].spawns).toEqual([]);
    expect(state.error).toMatch(/already assigned/i);
  });
});

describe("RemoveEnemyRoster / RemoveEnemyRosterSpawn", () => {
  test("removes a spawn from a roster without touching other rosters", () => {
    let state = withWolfRoster(makeState());
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "wolf_1",
      unitKey: "PackLeader",
    });
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "wolf_2",
      unitKey: "PackFollower",
    });

    const removed = rosterEditorReducer(state, {
      type: RosterEditorEventType.RemoveEnemyRosterSpawn,
      rosterIndex: 0,
      spawnIndex: 0,
    });
    expect(removed.enemies[0].spawns).toEqual([{ section: "wolf_2", unitKey: "PackFollower" }]);
  });

  test("removes a whole roster by index", () => {
    let state = withWolfRoster(makeState());
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRoster,
      factionKey: "wanderer",
      behaviorKey: "Flee",
      turnEventName: "wandererTurn",
    });

    const removed = rosterEditorReducer(state, {
      type: RosterEditorEventType.RemoveEnemyRoster,
      rosterIndex: 0,
    });
    expect(removed.enemies).toEqual([
      { factionKey: "wanderer", behaviorKey: "Flee", turnEventName: "wandererTurn", spawns: [] },
    ]);
  });

  test("rejects removing a player spawn, enemy roster, or roster spawn at an out-of-range index", () => {
    const withSpawn = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    const badPlayerRemove = rosterEditorReducer(withSpawn, {
      type: RosterEditorEventType.RemovePlayerSpawn,
      index: 5,
    });
    expect(badPlayerRemove.playerSpawns).toEqual(withSpawn.playerSpawns);
    expect(badPlayerRemove.error).toMatch(/no player spawn/i);

    const withRoster = withWolfRoster(makeState());
    const badRosterRemove = rosterEditorReducer(withRoster, {
      type: RosterEditorEventType.RemoveEnemyRoster,
      rosterIndex: 5,
    });
    expect(badRosterRemove.enemies).toEqual(withRoster.enemies);
    expect(badRosterRemove.error).toMatch(/no enemy roster/i);

    const badRosterSpawnRemove = rosterEditorReducer(withRoster, {
      type: RosterEditorEventType.RemoveEnemyRosterSpawn,
      rosterIndex: 0,
      spawnIndex: 5,
    });
    expect(badRosterSpawnRemove.enemies).toEqual(withRoster.enemies);
    expect(badRosterSpawnRemove.error).toMatch(/no spawn/i);

    const badRosterIndexSpawnRemove = rosterEditorReducer(withRoster, {
      type: RosterEditorEventType.RemoveEnemyRosterSpawn,
      rosterIndex: 5,
      spawnIndex: 0,
    });
    expect(badRosterIndexSpawnRemove.enemies).toEqual(withRoster.enemies);
    expect(badRosterIndexSpawnRemove.error).toMatch(/no enemy roster/i);
  });
});

describe("SetWinSection", () => {
  test("sets a known section", () => {
    const state = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.SetWinSection,
      section: "village",
    });
    expect(state.winSection).toBe("village");
    expect(state.error).toBe(null);
  });

  test("rejects an unknown section, leaving winSection unchanged", () => {
    const state = rosterEditorReducer(makeState(), {
      type: RosterEditorEventType.SetWinSection,
      section: "nowhere",
    });
    expect(state.winSection).toBe("");
    expect(state.error).toMatch(/unknown section/i);
  });
});

describe("a full authoring sequence (Seam 2: place tile / assign section / add spawn / assign roster / set win section)", () => {
  test("builds a Stage-1-equivalent StageRosterData, and the result behaves correctly through the resolver", () => {
    // "place tile, assign section" already happened — that's what makeBoard()
    // represents (the board-tile reducer in src/game/editor/reducer.ts is
    // this state's board-authoring counterpart; see roster_editor_reducer.ts's
    // module comment for why the two aren't composed into one reducer yet).
    let state = createRosterEditorState(makeBoard());

    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_a",
      unitKey: "Hero",
    });
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddPlayerSpawn,
      section: "spawn_b",
      unitKey: "Hero",
    });
    state = withWolfRoster(state);
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "wolf_1",
      unitKey: "PackLeader",
    });
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "wolf_2",
      unitKey: "PackFollower",
    });
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 0,
      section: "wolf_3",
      unitKey: "PackFollower",
    });
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRoster,
      factionKey: "wanderer",
      behaviorKey: "Flee",
      turnEventName: "wandererTurn",
    });
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.AddEnemyRosterSpawn,
      rosterIndex: 1,
      section: "wanderer_spawn",
      unitKey: "Wanderer",
    });
    state = rosterEditorReducer(state, {
      type: RosterEditorEventType.SetWinSection,
      section: "village",
    });

    expect(state.error).toBe(null);
    expect(toStageRosterData(state)).toEqual({
      playerSpawns: [
        { section: "spawn_a", unitKey: "Hero" },
        { section: "spawn_b", unitKey: "Hero" },
      ],
      enemies: [
        {
          factionKey: "wolves",
          behaviorKey: "Pack",
          turnEventName: "wolfTurn",
          spawns: [
            { section: "wolf_1", unitKey: "PackLeader" },
            { section: "wolf_2", unitKey: "PackFollower" },
            { section: "wolf_3", unitKey: "PackFollower" },
          ],
        },
        {
          factionKey: "wanderer",
          behaviorKey: "Flee",
          turnEventName: "wandererTurn",
          spawns: [{ section: "wanderer_spawn", unitKey: "Wanderer" }],
        },
      ],
      winSection: "village",
    });

    // Closing the loop with Seam 1: the reducer's output must be usable by
    // the resolver exactly like any other StageRosterData.
    const game = new Game(makeBoard());
    new Scenario(game, resolveStageDefinition(toStageRosterData(state))).start();

    const units = game.world.getState().units;
    const byOwner = (id: string) => units.filter((u) => u.owner.id === id);
    expect(byOwner("human")).toHaveLength(2);
    expect(byOwner("wolves")).toHaveLength(3);
    expect(byOwner("wanderer")).toHaveLength(1);
  });
});
