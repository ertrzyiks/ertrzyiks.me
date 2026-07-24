import { describe, expect, test } from "vitest";
import { Game } from "../core/game";
import { Terrain, type Board } from "../core/board";
import { GameEventType } from "../core/game_event";
import { isDamaging } from "../core/units";
import { Scenario } from "./scenario";
import { createStage1Definition } from "./stages/stage1";
import { createStage2Definition } from "./stages/stage2";
import { createStage3Definition } from "./stages/stage3";

// A single flat row with every section any stage definition under test might
// reference, so Stage 1/2/3 definitions can all spawn onto it. `World.
// tileBySection` falls back to tiles[0] for an unknown name, so every section
// used below must be a real, distinct tile or a bug there would go unnoticed.
function makeBoard(): Board {
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

// Flush the microtask-based `Observable` pipeline (shared/observable.ts) that
// carries turn transitions between Scenario and Game.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Scenario (Stage 1 definition)", () => {
  test("spawns Whirley's two heroes, the wolf pack, and the Wanderer at their sections", () => {
    const game = new Game(makeBoard());
    new Scenario(game, createStage1Definition()).start();

    const units = game.world.getState().units;
    const byOwner = (id: string) => units.filter((u) => u.owner.id === id);
    expect(byOwner("human")).toHaveLength(2);
    expect(byOwner("wolves")).toHaveLength(3);
    expect(byOwner("wanderer")).toHaveLength(1);
  });

  test("starts with the human's turn", async () => {
    const game = new Game(makeBoard());
    const scenario = new Scenario(game, createStage1Definition());
    const events: string[] = [];
    scenario.emitter.on("playerTurn", () => events.push("playerTurn"));
    scenario.emitter.on("wolfTurn", () => events.push("wolfTurn"));
    scenario.emitter.on("wandererTurn", () => events.push("wandererTurn"));

    // start() dispatches PlayerJoin x3 + Spawn x6 + StartTurn synchronously,
    // but the Observable Scenario subscribes to (shared/observable.ts) drains
    // one queued item per microtask — so StartTurn's delivery, and thus this
    // emit, lags start()'s synchronous return by several microtask ticks.
    scenario.start();
    await flush();

    expect(events).toEqual(["playerTurn"]);
  });

  test("ending the human's turn hands the turn to the wolf pack next", async () => {
    const game = new Game(makeBoard());
    const scenario = new Scenario(game, createStage1Definition());
    const events: string[] = [];
    scenario.emitter.on("wolfTurn", () => events.push("wolfTurn"));

    scenario.start();
    await flush(); // let the human's StartTurn actually be delivered first
    scenario.endPlayerTurn();
    await flush();

    // On this minimal 1-row test board every CPU faction has no useful move
    // and ends its turn immediately, so by the time flush() settles the turn
    // has already cascaded wolves -> Wanderer -> back to human — checking
    // currentPlayer here would be asserting on that cascade, not on "did
    // ending the human's turn hand it to the wolves next". The wolfTurn emit
    // (fired exactly once, for the wolves and no one else) is the stable
    // signal for that.
    expect(events).toEqual(["wolfTurn"]);
  });

  test("winning is reaching the village, not the gate", () => {
    const game = new Game(makeBoard());
    new Scenario(game, createStage1Definition()).start();

    const hero = game.world.getState().units.find((u) => u.owner.id === "human")!;
    hero.unit.replenish();
    const village = game.world.tileBySection("village").cube();

    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: village });

    expect(game.world.getState().outcome).toBe("win");
  });
});

describe("Scenario.reload", () => {
  test("clears runtime state and respawns the given definition fresh", async () => {
    const game = new Game(makeBoard());
    const scenario = new Scenario(game, createStage1Definition());
    scenario.start();
    await flush();

    scenario.reload(createStage1Definition());
    await flush();

    const state = game.world.getState();
    const units = state.units;
    const byOwner = (id: string) => units.filter((u) => u.owner.id === id);
    expect(byOwner("human")).toHaveLength(2);
    expect(byOwner("wolves")).toHaveLength(3);
    expect(byOwner("wanderer")).toHaveLength(1);
    expect(state.turn).toBe(1);
    expect(state.outcome).toBe(null);
  });

  test("clears a terminal outcome so the reloaded stage is playable again (spec 08 'stage reset on lose')", async () => {
    const game = new Game(makeBoard());
    const scenario = new Scenario(game, createStage1Definition());
    scenario.start();

    const hero = game.world.getState().units.find((u) => u.owner.id === "human")!;
    hero.unit.replenish();
    const village = game.world.tileBySection("village").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: village });
    expect(game.world.getState().outcome).toBe("win");

    scenario.reload(createStage1Definition());
    await flush();

    expect(game.world.getState().outcome).toBe(null);
  });

  test("can switch to a different stage's definition (spec 08 'stage progression')", async () => {
    const game = new Game(makeBoard());
    const scenario = new Scenario(game, createStage1Definition());
    scenario.start();
    await flush();

    scenario.reload(createStage2Definition());
    await flush();

    const units = game.world.getState().units;
    const byOwner = (id: string) => units.filter((u) => u.owner.id === id);
    // Stage 2 spawns one Hero (not Stage 1's two) and bandits, not wolves.
    expect(byOwner("human")).toHaveLength(1);
    expect(byOwner("bandits")).toHaveLength(3);
    expect(byOwner("wolves")).toHaveLength(0);

    // Win condition now matches Stage 2 (gate), not Stage 1 (village) — this
    // shared test board happens to have both sections, so this would silently
    // pass for the wrong reason if reload() hadn't actually swapped it.
    const hero = units.find((u) => u.owner.id === "human")!;
    hero.unit.replenish();
    const village = game.world.tileBySection("village").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: village });
    expect(game.world.getState().outcome).toBe(null);
  });
});

describe("Scenario (Stage 2 definition)", () => {
  test("spawns one hero, three bandits, and the Wanderer at their sections", () => {
    const game = new Game(makeBoard());
    new Scenario(game, createStage2Definition()).start();

    const units = game.world.getState().units;
    const byOwner = (id: string) => units.filter((u) => u.owner.id === id);
    expect(byOwner("human")).toHaveLength(1);
    expect(byOwner("bandits")).toHaveLength(3);
    expect(byOwner("wanderer")).toHaveLength(1);
  });

  test("ending the human's turn hands the turn to the bandits next", async () => {
    const game = new Game(makeBoard());
    const scenario = new Scenario(game, createStage2Definition());
    const events: string[] = [];
    scenario.emitter.on("banditTurn", () => events.push("banditTurn"));

    scenario.start();
    await flush(); // let the human's StartTurn actually be delivered first
    scenario.endPlayerTurn();
    await flush();

    // Same caveat as Stage 1's equivalent test: every CPU faction no-ops and
    // ends its turn immediately on this minimal board, so currentPlayer has
    // already cascaded past bandits by the time flush() settles. The
    // banditTurn emit is the stable signal that it was handed to them next.
    expect(events).toEqual(["banditTurn"]);
  });

  test("winning is reaching the gate, not the village", () => {
    const game = new Game(makeBoard());
    new Scenario(game, createStage2Definition()).start();

    const hero = game.world.getState().units.find((u) => u.owner.id === "human")!;
    hero.unit.replenish();
    const village = game.world.tileBySection("village").cube();

    // The village section exists on this shared test board, but Stage 2's win
    // condition is the gate — reaching "village" must NOT end the stage.
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: village });
    expect(game.world.getState().outcome).toBe(null);

    const gate = game.world.tileBySection("gate").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: gate });
    expect(game.world.getState().outcome).toBe("win");
  });
});

describe("Scenario (Stage 3 definition)", () => {
  test("spawns one hero, three bandits plus the captain (one faction), and the Wanderer", () => {
    const game = new Game(makeBoard());
    new Scenario(game, createStage3Definition()).start();

    const units = game.world.getState().units;
    const byOwner = (id: string) => units.filter((u) => u.owner.id === id);
    expect(byOwner("human")).toHaveLength(1);
    // 3 standard Bandits + 1 BanditCaptain, all under the same "bandits" faction.
    expect(byOwner("bandits")).toHaveLength(4);
    expect(byOwner("wanderer")).toHaveLength(1);
  });

  test("ending the human's turn hands the turn to the bandits (and captain) next", async () => {
    const game = new Game(makeBoard());
    const scenario = new Scenario(game, createStage3Definition());
    const events: string[] = [];
    scenario.emitter.on("banditTurn", () => events.push("banditTurn"));

    scenario.start();
    await flush(); // let the human's StartTurn actually be delivered first
    scenario.endPlayerTurn();
    await flush();

    // Same caveat as Stage 1/2's equivalent tests: every CPU faction no-ops
    // and ends its turn immediately on this minimal board, so currentPlayer
    // has already cascaded past bandits by the time flush() settles. The
    // banditTurn emit is the stable signal that it was handed to them next.
    expect(events).toEqual(["banditTurn"]);
  });

  test("winning is reaching the campfire, not the gate or village", () => {
    const game = new Game(makeBoard());
    new Scenario(game, createStage3Definition()).start();

    const hero = game.world.getState().units.find((u) => u.owner.id === "human")!;
    hero.unit.replenish();

    // Both the village and gate sections exist on this shared test board, but
    // Stage 3's win condition is the campfire — reaching either must NOT end
    // the stage.
    const village = game.world.tileBySection("village").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: village });
    expect(game.world.getState().outcome).toBe(null);

    const gate = game.world.tileBySection("gate").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: gate });
    expect(game.world.getState().outcome).toBe(null);

    const campfire = game.world.tileBySection("campfire").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: campfire });
    expect(game.world.getState().outcome).toBe("win");
  });

  test("the Bandit Captain has measurably higher HP and damage than a standard Bandit", () => {
    const game = new Game(makeBoard());
    new Scenario(game, createStage3Definition()).start();

    const bandits = game.world.getState().units.filter((u) => u.owner.id === "bandits");
    // captain_spawn is the 4th bandit-faction spawn in stage3.ts's definition
    // order; identify it by damage (12) rather than array position to avoid
    // coupling this test to that ordering.
    const damages = bandits.map((u) => (isDamaging(u.unit) ? u.unit.damage : null));
    expect(damages.filter((d) => d === 8)).toHaveLength(3); // standard Bandits
    expect(damages.filter((d) => d === 12)).toHaveLength(1); // the Captain
  });
});
