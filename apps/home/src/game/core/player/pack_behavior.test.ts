import { describe, expect, test } from "vitest";
import { PackBehavior, createPackMemory } from "./pack_behavior";
import { PlayerActionType, type PlayerAction, type MoveAction } from "../player_action";
import { PlayerColor } from "./player";
import { Unit, Movable, Damageable, Damaging, Sightful, Leader, Follower } from "../units";
import { positionAt, hexDistance, cubeKey } from "../grid";
import { makeTiles, cubeAt } from "../grid/test_helpers";
import { directionToward, randomValidDirection, createMoveContext } from "./movement";
import type { GameTileHex, UnitPosition } from "../board";
import type { StoreProxy } from "../store";
import type { GameEvent } from "../game_event";
import type { State } from "../world";
import { Game } from "../game";
import { Terrain, type Board } from "../board";
import { createPlayerStore } from "../player_store";
import { PackLeader, PackFollower } from "../../main/units/wolf";
import { GameEventType } from "../game_event";

const wolves = { id: "wolves", name: "Pack", color: PlayerColor.RED };

const PackLeaderUnit = Leader(Sightful(Movable(Damageable(Unit, 20), 2), 2));
const PackFollowerUnit = Follower(Sightful(Movable(Damageable(Unit, 15), 2), 1));

function makeStore(units: UnitPosition[], tiles: GameTileHex[]) {
  const dispatched: PlayerAction[] = [];
  const state = { units, tiles, cols: 5, rows: 5 } as unknown as State;
  const store = {
    getState: () => state,
    dispatch: (a: PlayerAction) => dispatched.push(a),
    subscribe: () => {},
  } as unknown as StoreProxy<GameEvent, State, PlayerAction>;
  return { store, dispatched };
}

const moves = (d: PlayerAction[]) =>
  d.filter((a): a is MoveAction => a.type === PlayerActionType.Move);

const human = { id: "human", name: "Whirley", color: PlayerColor.BLUE };

// A wolf that can bite, plus a separate `allUnits` roster so the behavior can
// see the (enemy) Hero the way the per-player proxy would expose it.
const ArmedLeader = Leader(Damaging(Sightful(Movable(Damageable(Unit, 20), 2), 2), 7));
const HeroUnit = Sightful(Movable(Damageable(Unit, 30), 3), 2);

function makeStoreWithRoster(
  units: UnitPosition[],
  allUnits: UnitPosition[],
  tiles: GameTileHex[]
) {
  const dispatched: PlayerAction[] = [];
  const state = { units, allUnits, tiles, cols: 5, rows: 5 } as unknown as State;
  const store = {
    getState: () => state,
    dispatch: (a: PlayerAction) => dispatched.push(a),
    subscribe: () => {},
  } as unknown as StoreProxy<GameEvent, State, PlayerAction>;
  return { store, dispatched };
}

describe("PackBehavior", () => {
  test("always ends the turn after acting", () => {
    const { store, dispatched } = makeStore([], makeTiles());
    new PackBehavior(store, createPackMemory(), () => 0).takeActions();
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });

  test("the leader wanders (emits a move) and acts before followers", () => {
    const tiles = makeTiles();
    const leader = new PackLeaderUnit();
    leader.replenish();
    const follower = new PackFollowerUnit();
    follower.replenish();

    // Spawn-order with follower first to prove the behavior reorders leader-first.
    const { store, dispatched } = makeStore(
      [
        { unit: follower, position: cubeAt(tiles, 0, 0), owner: wolves },
        { unit: leader, position: cubeAt(tiles, 2, 2), owner: wolves },
      ],
      tiles
    );

    new PackBehavior(store, createPackMemory(), () => 0).takeActions();

    const m = moves(dispatched);
    expect(m.length).toBeGreaterThan(0);
    expect(m[0].unit).toBe(leader); // leader resolves first
  });

  test("a follower steps toward the living leader", () => {
    const tiles = makeTiles();
    const leader = new PackLeaderUnit();
    leader.replenish();
    const follower = new PackFollowerUnit();
    follower.replenish();

    const leaderPos = cubeAt(tiles, 4, 2);
    const followerPos = cubeAt(tiles, 0, 2);
    const { store, dispatched } = makeStore(
      [
        { unit: leader, position: leaderPos, owner: wolves },
        { unit: follower, position: followerPos, owner: wolves },
      ],
      tiles
    );

    new PackBehavior(store, createPackMemory(), () => 0).takeActions();

    const followerMove = moves(dispatched).find((a) => a.unit === follower)!;
    expect(followerMove).toBeDefined();
    // The chosen direction must be the toward-leader step, shrinking distance.
    const ctx = createMoveContext({ tiles, units: store.getState().units });
    expect(followerMove.direction).toBe(directionToward(followerPos, leaderPos, ctx));
    expect(
      hexDistance(positionAt(followerPos, followerMove.direction), leaderPos)
    ).toBeLessThan(hexDistance(followerPos, leaderPos));
  });

  test("a follower already adjacent to the leader stays put", () => {
    const tiles = makeTiles();
    const leader = new PackLeaderUnit();
    leader.replenish();
    const follower = new PackFollowerUnit();
    follower.replenish();

    const leaderPos = cubeAt(tiles, 2, 2);
    const ctx = createMoveContext({ tiles, units: [] });
    const adjacentPos = positionAt(leaderPos, randomValidDirection(leaderPos, ctx, null, () => 0)!);

    const { store, dispatched } = makeStore(
      [
        { unit: leader, position: leaderPos, owner: wolves },
        { unit: follower, position: adjacentPos, owner: wolves },
      ],
      tiles
    );

    new PackBehavior(store, createPackMemory(), () => 0).takeActions();

    expect(moves(dispatched).some((a) => a.unit === follower)).toBe(false);
  });

  test("with no leader present, followers wander instead of converging", () => {
    const tiles = makeTiles();
    const follower = new PackFollowerUnit();
    follower.replenish();
    const followerPos = cubeAt(tiles, 1, 1);

    const { store, dispatched } = makeStore(
      [{ unit: follower, position: followerPos, owner: wolves }],
      tiles
    );

    new PackBehavior(store, createPackMemory(), () => 0).takeActions();

    const followerMove = moves(dispatched).find((a) => a.unit === follower)!;
    expect(followerMove).toBeDefined();
    const ctx = createMoveContext({ tiles, units: store.getState().units });
    // Dissolved followers use the wander selector, not toward-target logic.
    expect(followerMove.direction).toBe(
      randomValidDirection(followerPos, ctx, null, () => 0)
    );
  });

  test("a defeated (non-alive) leader dissolves the pack", () => {
    const tiles = makeTiles();
    const leader = new PackLeaderUnit();
    leader.replenish();
    leader.takeDamage(20); // dead, but still in the units list this turn
    const follower = new PackFollowerUnit();
    follower.replenish();

    const leaderPos = cubeAt(tiles, 4, 4);
    const followerPos = cubeAt(tiles, 0, 0);
    const { store, dispatched } = makeStore(
      [
        { unit: leader, position: leaderPos, owner: wolves },
        { unit: follower, position: followerPos, owner: wolves },
      ],
      tiles
    );

    new PackBehavior(store, createPackMemory(), () => 0).takeActions();

    const followerMove = moves(dispatched).find((a) => a.unit === follower)!;
    expect(followerMove).toBeDefined();
    const ctx = createMoveContext({ tiles, units: store.getState().units });
    // Treated as leaderless -> wander, not a step toward the dead leader.
    expect(followerMove.direction).toBe(
      randomValidDirection(followerPos, ctx, null, () => 0)
    );
  });

  test("skips units that have no movement budget", () => {
    const tiles = makeTiles();
    const leader = new PackLeaderUnit(); // never replenished -> cannot move
    const { store, dispatched } = makeStore(
      [{ unit: leader, position: cubeAt(tiles, 2, 2), owner: wolves }],
      tiles
    );

    new PackBehavior(store, createPackMemory(), () => 0).takeActions();

    expect(moves(dispatched)).toHaveLength(0);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });

  test("remembers the last direction across turns to avoid backtracking", () => {
    const tiles = makeTiles();
    const leader = new PackLeaderUnit();
    leader.replenish();
    const memory = createPackMemory();

    const { store } = makeStore(
      [{ unit: leader, position: cubeAt(tiles, 2, 2), owner: wolves }],
      tiles
    );
    new PackBehavior(store, memory, () => 0).takeActions();

    // The wander step was recorded under the unit id for the next turn's use.
    expect(memory.lastDirection[leader.id]).toBeDefined();
  });

  test("a wolf attacks an adjacent non-wolf unit after moving", () => {
    const tiles = makeTiles();
    const wolf = new ArmedLeader();
    wolf.replenish(); // can move and can attack
    const hero = new HeroUnit();
    hero.replenish(); // alive

    const wolfPos = cubeAt(tiles, 2, 2);
    const heroPos = positionAt(wolfPos, "ne"); // adjacent

    const wolfEntry: UnitPosition = { unit: wolf, position: wolfPos, owner: wolves };
    const heroEntry: UnitPosition = { unit: hero, position: heroPos, owner: human };

    // The behavior only iterates `units` (wolves) for movement, but reads the
    // full `allUnits` roster to spot the adjacent Hero as a bite target.
    const { store, dispatched } = makeStoreWithRoster(
      [wolfEntry],
      [wolfEntry, heroEntry],
      tiles
    );

    new PackBehavior(store, createPackMemory(), () => 0).takeActions();

    const attacks = dispatched.filter((a) => a.type === PlayerActionType.Attack);
    expect(attacks).toHaveLength(1);
    expect((attacks[0] as any).unit).toBe(wolf);
    expect((attacks[0] as any).position).toEqual(heroPos);
  });

  test("a disarmed wolf (no Damaging) emits no attack", () => {
    const tiles = makeTiles();
    const PlainLeader = Leader(Sightful(Movable(Damageable(Unit, 20), 2), 2));
    const wolf = new PlainLeader();
    wolf.replenish();
    const hero = new HeroUnit();
    hero.replenish();

    const wolfPos = cubeAt(tiles, 2, 2);
    const heroPos = positionAt(wolfPos, "ne");
    const wolfEntry: UnitPosition = { unit: wolf, position: wolfPos, owner: wolves };
    const heroEntry: UnitPosition = { unit: hero, position: heroPos, owner: human };

    const { dispatched } = ((): { dispatched: PlayerAction[] } => {
      const { store, dispatched } = makeStoreWithRoster(
        [wolfEntry],
        [wolfEntry, heroEntry],
        tiles
      );
      new PackBehavior(store, createPackMemory(), () => 0).takeActions();
      return { dispatched };
    })();

    expect(dispatched.some((a) => a.type === PlayerActionType.Attack)).toBe(false);
  });

  // Regression for #172: PackBehavior computes one occupancy snapshot
  // (createMoveContext) before moving every wolf in the loop, so a follower
  // later in the loop can pick a destination another wolf already stepped
  // into earlier in the same loop. Positions below are a known geometric
  // collision found by brute-force search over a real makeTiles board: both
  // followers independently compute "toward the leader" steps that land on
  // the exact same hex. This drives PackBehavior through a *real* Store and
  // reducer (unlike the mock store above, which never applies dispatched
  // actions to state) so the reducer's live occupancy check is genuinely
  // exercised, not bypassed by test scaffolding.
  function setupCollisionScenario() {
    const board: Board = {
      rows: 3,
      cols: 3,
      tiles: Array.from({ length: 3 }, (_, x) =>
        Array.from({ length: 3 }, (_, y) => {
          const sectionName =
            x === 0 && y === 0
              ? "leader_spawn"
              : x === 1 && y === 1
              ? "a_spawn"
              : x === 2 && y === 0
              ? "b_spawn"
              : "none";
          return { x, y, type: Terrain.WATER, textureName: "grass", sectionName };
        })
      ).flat(),
    };

    const game = new Game(board);
    game.add(wolves);

    const leader = new PackLeader();
    const followerA = new PackFollower();
    const followerB = new PackFollower();

    game.spawnInSection(wolves, leader, "leader_spawn");
    game.spawnInSection(wolves, followerA, "a_spawn");
    game.spawnInSection(wolves, followerB, "b_spawn");
    leader.replenish();
    followerA.replenish();
    followerB.replenish();

    return { game, leader, followerA, followerB };
  }

  test("two wolves never end up on the same hex after a pack turn", () => {
    const { game } = setupCollisionScenario();

    const store = createPlayerStore(game.world.store, wolves);
    new PackBehavior(store, createPackMemory(), () => 0).takeActions();

    const positions = game.world.getState().units.map((u) => cubeKey(u.position));
    expect(new Set(positions).size).toBe(positions.length);
  });

  // Issue #172's acceptance criteria explicitly asks for multiple pack turns,
  // not just one: a collision that only manifests once the pack has wandered
  // a few turns (e.g. once positions have converged further) wouldn't be
  // caught by a single-turn check. The memory instance is reused across
  // turns, same as Scenario does in the real game (a fresh PackBehavior is
  // constructed each turn, but the pack's no-backtrack memory persists).
  test("two wolves never end up on the same hex across several consecutive pack turns", () => {
    const { game, leader, followerA, followerB } = setupCollisionScenario();
    const memory = createPackMemory();

    for (let turn = 0; turn < 5; turn++) {
      leader.replenish();
      followerA.replenish();
      followerB.replenish();

      const store = createPlayerStore(game.world.store, wolves);
      new PackBehavior(store, memory, () => 0).takeActions();

      const positions = game.world.getState().units.map((u) => cubeKey(u.position));
      expect(new Set(positions).size).toBe(positions.length);
    }
  });

  // Before the ctx-refresh fix, follower B would still *dispatch* a Move onto
  // the hex follower A had just taken (computed from the stale pre-loop
  // snapshot) — the reducer silently rejected it, wasting the attempt. With a
  // fresh ctx each iteration, no wolf ever dispatches a Move at a hex another
  // wolf already holds at that point in the loop.
  test("no wolf dispatches a move onto a hex another wolf already occupies mid-loop", () => {
    const { game } = setupCollisionScenario();
    const movedTo: string[] = [];
    game.world.subscribe((_state, action) => {
      if (action.type === GameEventType.Move) {
        movedTo.push(cubeKey(action.position));
      }
    });

    const store = createPlayerStore(game.world.store, wolves);
    new PackBehavior(store, createPackMemory(), () => 0).takeActions();

    expect(new Set(movedTo).size).toBe(movedTo.length);
  });
});
