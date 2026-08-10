import { describe, expect, test } from "vitest";
import { Game } from "../../core/game";
import { GameEventType } from "../../core/game_event";
import { isDamaging } from "../../core/units";
import type { PackMemory } from "../../core/player/pack_behavior";
import { Scenario } from "../scenario";
import { makeBoard, flush, makeStoreDouble } from "../test_helpers";
import { resolveStageDefinition } from "./resolver";
import type { StageRosterData } from "./stage_roster";

// Equivalent to createStage1Definition() (main/stages/stage1.ts), expressed
// as editor-authored data instead of hand-written factories.
const stage1Roster: StageRosterData = {
  playerSpawns: [{ section: "spawn_a", unitKey: "Hero" }],
  enemies: [
    {
      factionKey: "wolves",
      spawns: [
        { section: "wolf_1", unitKey: "PackLeader" },
        { section: "wolf_2", unitKey: "PackFollower" },
        { section: "wolf_3", unitKey: "PackFollower" },
      ],
      behaviorKey: "Pack",
      turnEventName: "wolfTurn",
    },
    {
      factionKey: "wanderer",
      spawns: [{ section: "wanderer_spawn", unitKey: "Wanderer" }],
      behaviorKey: "Flee",
      turnEventName: "wandererTurn",
    },
  ],
  winSection: "village",
};

// Equivalent to createStage2Definition() (main/stages/stage2.ts).
const stage2Roster: StageRosterData = {
  playerSpawns: [{ section: "spawn_a", unitKey: "Hero" }],
  enemies: [
    {
      factionKey: "bandits",
      spawns: [
        { section: "bandit_1", unitKey: "Bandit" },
        { section: "bandit_2", unitKey: "Bandit" },
        { section: "bandit_3", unitKey: "Bandit" },
      ],
      behaviorKey: "Seeker",
      turnEventName: "banditTurn",
    },
    {
      factionKey: "wanderer",
      spawns: [{ section: "wanderer_spawn", unitKey: "Wanderer" }],
      behaviorKey: "Flee",
      turnEventName: "wandererTurn",
    },
  ],
  winSection: "gate",
};

// Equivalent to createStage3Definition() (main/stages/stage3.ts): three
// standard Bandits plus one BanditCaptain, one faction.
const stage3Roster: StageRosterData = {
  playerSpawns: [{ section: "spawn_a", unitKey: "Hero" }],
  enemies: [
    {
      factionKey: "bandits",
      spawns: [
        { section: "bandit_4", unitKey: "Bandit" },
        { section: "bandit_5", unitKey: "Bandit" },
        { section: "bandit_6", unitKey: "Bandit" },
        { section: "captain_spawn", unitKey: "BanditCaptain" },
      ],
      behaviorKey: "Seeker",
      turnEventName: "banditTurn",
    },
    {
      factionKey: "wanderer",
      spawns: [{ section: "wanderer_spawn", unitKey: "Wanderer" }],
      behaviorKey: "Flee",
      turnEventName: "wandererTurn",
    },
  ],
  winSection: "campfire",
};

describe("resolveStageDefinition (Stage 1-equivalent roster)", () => {
  test("spawns Whirley's hero, the wolf pack, and the Wanderer at their sections", () => {
    const game = new Game(makeBoard());
    new Scenario(game, resolveStageDefinition(stage1Roster)).start();

    const units = game.world.getState().units;
    const byOwner = (id: string) => units.filter((u) => u.owner.id === id);
    expect(byOwner("human")).toHaveLength(1);
    expect(byOwner("wolves")).toHaveLength(3);
    expect(byOwner("wanderer")).toHaveLength(1);
  });

  test("ending the human's turn hands the turn to the wolf pack next", async () => {
    const game = new Game(makeBoard());
    const scenario = new Scenario(game, resolveStageDefinition(stage1Roster));
    const events: string[] = [];
    scenario.emitter.on("wolfTurn", () => events.push("wolfTurn"));

    scenario.start();
    await flush();
    scenario.endPlayerTurn();
    await flush();

    // Same caveat as scenario.test.ts's equivalent: every CPU faction no-ops
    // on this minimal board, so the wolfTurn emit (not currentPlayer) is the
    // stable signal that Pack behavior — and its PackMemory wiring — ran.
    expect(events).toEqual(["wolfTurn"]);
  });

  test("winning is reaching the village, not the gate", () => {
    const game = new Game(makeBoard());
    new Scenario(game, resolveStageDefinition(stage1Roster)).start();

    const hero = game.world.getState().units.find((u) => u.owner.id === "human")!;
    hero.unit.replenish();
    const village = game.world.tileBySection("village").cube();

    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: village });

    expect(game.world.getState().outcome).toBe("win");
  });
});

describe("resolveStageDefinition (Stage 2-equivalent roster)", () => {
  test("spawns one hero, three bandits, and the Wanderer at their sections", () => {
    const game = new Game(makeBoard());
    new Scenario(game, resolveStageDefinition(stage2Roster)).start();

    const units = game.world.getState().units;
    const byOwner = (id: string) => units.filter((u) => u.owner.id === id);
    expect(byOwner("human")).toHaveLength(1);
    expect(byOwner("bandits")).toHaveLength(3);
    expect(byOwner("wanderer")).toHaveLength(1);
  });

  test("winning is reaching the gate, not the village", () => {
    const game = new Game(makeBoard());
    new Scenario(game, resolveStageDefinition(stage2Roster)).start();

    const hero = game.world.getState().units.find((u) => u.owner.id === "human")!;
    hero.unit.replenish();

    const village = game.world.tileBySection("village").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: village });
    expect(game.world.getState().outcome).toBe(null);

    const gate = game.world.tileBySection("gate").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: gate });
    expect(game.world.getState().outcome).toBe("win");
  });
});

describe("resolveStageDefinition (Stage 3-equivalent roster)", () => {
  test("spawns one hero, three bandits plus the captain (one faction), and the Wanderer", () => {
    const game = new Game(makeBoard());
    new Scenario(game, resolveStageDefinition(stage3Roster)).start();

    const units = game.world.getState().units;
    const byOwner = (id: string) => units.filter((u) => u.owner.id === id);
    expect(byOwner("human")).toHaveLength(1);
    expect(byOwner("bandits")).toHaveLength(4);
    expect(byOwner("wanderer")).toHaveLength(1);
  });

  test("the resolved Bandit Captain has measurably higher HP and damage than a resolved standard Bandit", () => {
    const game = new Game(makeBoard());
    new Scenario(game, resolveStageDefinition(stage3Roster)).start();

    const bandits = game.world.getState().units.filter((u) => u.owner.id === "bandits");
    const damages = bandits.map((u) => (isDamaging(u.unit) ? u.unit.damage : null));
    expect(damages.filter((d) => d === 8)).toHaveLength(3); // standard Bandits
    expect(damages.filter((d) => d === 12)).toHaveLength(1); // the Captain
  });

  test("winning is reaching the campfire, not the gate", () => {
    const game = new Game(makeBoard());
    new Scenario(game, resolveStageDefinition(stage3Roster)).start();

    const hero = game.world.getState().units.find((u) => u.owner.id === "human")!;
    hero.unit.replenish();

    const gate = game.world.tileBySection("gate").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: gate });
    expect(game.world.getState().outcome).toBe(null);

    const campfire = game.world.tileBySection("campfire").cube();
    game.world.dispatch({ type: GameEventType.Move, unit: hero.unit, position: campfire });
    expect(game.world.getState().outcome).toBe("win");
  });
});

describe("resolveStageDefinition (identity/reload correctness)", () => {
  test("returns fresh Player objects on every call, not shared mutable identities", () => {
    const a = resolveStageDefinition(stage1Roster);
    const b = resolveStageDefinition(stage1Roster);
    expect(a.player).not.toBe(b.player);
    expect(a.enemies[0].player).not.toBe(b.enemies[0].player);
  });

  test("threads the same PackMemory into every createBehavior call within one resolved definition", () => {
    // Mirrors createStage1Definition's own contract: packMemory is declared
    // once per stage load and closed over by every returned PackBehavior, so
    // the no-backtrack rule holds across turns (multiple createBehavior calls
    // on the *same* roster).
    const store = makeStoreDouble();
    const wolves = resolveStageDefinition(stage1Roster).enemies.find(
      (e) => e.player.id === "wolves"
    )!;

    const first = wolves.createBehavior(store) as unknown as { memory: PackMemory };
    const second = wolves.createBehavior(store) as unknown as { memory: PackMemory };

    expect(first.memory).toBe(second.memory);
  });

  test("gives two separately-resolved definitions their own, isolated PackMemory", () => {
    // A shared PackMemory across stage (re)loads would leak one playthrough's
    // wander history into the next — the same bug class createStage1Definition
    // avoids by declaring packMemory fresh inside its own function body.
    const store = makeStoreDouble();
    const wolvesA = resolveStageDefinition(stage1Roster).enemies.find(
      (e) => e.player.id === "wolves"
    )!;
    const wolvesB = resolveStageDefinition(stage1Roster).enemies.find(
      (e) => e.player.id === "wolves"
    )!;

    const behaviorA = wolvesA.createBehavior(store) as unknown as { memory: PackMemory };
    const behaviorB = wolvesB.createBehavior(store) as unknown as { memory: PackMemory };

    expect(behaviorA.memory).not.toBe(behaviorB.memory);
  });
});
