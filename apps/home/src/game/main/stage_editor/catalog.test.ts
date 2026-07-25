import { describe, expect, test } from "vitest";
import {
  UNIT_CATALOG,
  BEHAVIOR_CATALOG,
  FACTION_CATALOG,
  createUnitFromCatalog,
  createBehaviorFromCatalog,
  createPlayerFromCatalog,
  isUnitKey,
  isBehaviorKey,
  isFactionKey,
} from "./catalog";
import {
  PackBehavior,
  createPackMemory,
  type PackMemory,
} from "../../core/player/pack_behavior";
import { FleeBehavior } from "../../core/player/flee_behavior";
import { SeekerBehavior } from "../../core/player/seeker_behavior";
import { PlayerColor } from "../../core/player/player";
import { Hero, PackLeader, PackFollower, Wanderer, Bandit, BanditCaptain } from "../units";
import type { StoreProxy } from "../../core/store";
import type { GameEvent } from "../../core/game_event";
import type { State } from "../../core/world";
import type { PlayerAction } from "../../core/player_action";

// A minimal store double is enough here: these tests assert catalog *wiring*
// (does the right class come out, does the right id/memory get threaded in),
// not behavior algorithms — those already have dedicated coverage in
// pack_behavior.test.ts / flee_behavior.test.ts / seeker_behavior.test.ts.
function makeStore() {
  const state = { units: [], allUnits: [], tiles: [], cols: 5, rows: 5 } as unknown as State;
  return {
    getState: () => state,
    dispatch: () => {},
    subscribe: () => {},
  } as unknown as StoreProxy<GameEvent, State, PlayerAction>;
}

describe("UNIT_CATALOG", () => {
  test.each([
    ["Hero", Hero],
    ["PackLeader", PackLeader],
    ["PackFollower", PackFollower],
    ["Wanderer", Wanderer],
    ["Bandit", Bandit],
    ["BanditCaptain", BanditCaptain],
  ] as const)("%s produces the matching concrete unit", (key, Concrete) => {
    expect(createUnitFromCatalog(key)).toBeInstanceOf(Concrete);
  });

  test("has no keys beyond the fixed catalog", () => {
    expect(Object.keys(UNIT_CATALOG).sort()).toEqual(
      ["Bandit", "BanditCaptain", "Hero", "PackFollower", "PackLeader", "Wanderer"].sort()
    );
  });
});

describe("isUnitKey", () => {
  test("accepts every catalog key and rejects unknown strings", () => {
    for (const key of Object.keys(UNIT_CATALOG)) {
      expect(isUnitKey(key)).toBe(true);
    }
    expect(isUnitKey("Wolf")).toBe(false);
    expect(isUnitKey("")).toBe(false);
  });
});

describe("BEHAVIOR_CATALOG", () => {
  test("Pack produces a PackBehavior", () => {
    const behavior = createBehaviorFromCatalog("Pack", makeStore(), {
      targetPlayerId: "human",
      packMemory: createPackMemory(),
    });
    expect(behavior).toBeInstanceOf(PackBehavior);
  });

  test("Pack threads the given packMemory by reference, not a fresh copy", () => {
    const packMemory: PackMemory = createPackMemory();

    const behavior = createBehaviorFromCatalog("Pack", makeStore(), {
      targetPlayerId: "human",
      packMemory,
    }) as unknown as { memory: PackMemory };

    // Reference equality: a stage's pack must keep its no-backtrack memory
    // across turns, so the catalog must not create a fresh PackMemory itself.
    expect(behavior.memory).toBe(packMemory);
  });

  test("Flee produces a FleeBehavior that flees from the given targetPlayerId", () => {
    const behavior = createBehaviorFromCatalog("Flee", makeStore(), {
      targetPlayerId: "human",
      packMemory: createPackMemory(),
    }) as unknown as { fleeFrom: Set<string> };

    expect(behavior).toBeInstanceOf(FleeBehavior);
    expect([...behavior.fleeFrom]).toEqual(["human"]);
  });

  test("Seeker produces a SeekerBehavior that hunts the given targetPlayerId", () => {
    const behavior = createBehaviorFromCatalog("Seeker", makeStore(), {
      targetPlayerId: "human",
      packMemory: createPackMemory(),
    }) as unknown as { huntFor: Set<string> };

    expect(behavior).toBeInstanceOf(SeekerBehavior);
    expect([...behavior.huntFor]).toEqual(["human"]);
  });
});

describe("isBehaviorKey", () => {
  test("accepts every catalog key and rejects unknown strings", () => {
    for (const key of Object.keys(BEHAVIOR_CATALOG)) {
      expect(isBehaviorKey(key)).toBe(true);
    }
    expect(isBehaviorKey("Aggro")).toBe(false);
  });
});

describe("FACTION_CATALOG", () => {
  test("matches the ids/names/colors main/stages hand-write today", () => {
    expect(createPlayerFromCatalog("wolves")).toEqual({
      id: "wolves",
      name: "Pack",
      color: PlayerColor.RED,
    });
    expect(createPlayerFromCatalog("bandits")).toEqual({
      id: "bandits",
      name: "Bandits",
      color: PlayerColor.RED,
    });
    expect(createPlayerFromCatalog("wanderer")).toEqual({
      id: "wanderer",
      name: "Wanderer",
      color: PlayerColor.GREEN,
    });
  });

  test("returns a fresh object each call, not a shared mutable identity", () => {
    const a = createPlayerFromCatalog("wolves");
    const b = createPlayerFromCatalog("wolves");
    expect(a).not.toBe(b);
    expect(a).not.toBe(FACTION_CATALOG.wolves);
  });
});

describe("isFactionKey", () => {
  test("accepts every catalog key and rejects unknown strings", () => {
    for (const key of Object.keys(FACTION_CATALOG)) {
      expect(isFactionKey(key)).toBe(true);
    }
    expect(isFactionKey("dragons")).toBe(false);
  });
});
