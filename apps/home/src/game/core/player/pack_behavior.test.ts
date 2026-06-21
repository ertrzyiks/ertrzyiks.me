import { describe, expect, test } from "vitest";
import { PackBehavior, createPackMemory } from "./pack_behavior";
import { PlayerActionType, type PlayerAction, type MoveAction } from "../player_action";
import { PlayerColor } from "./player";
import { Unit, Movable, Damageable, Damaging, Sightful, Leader, Follower } from "../units";
import { createGrid, positionAt, hexDistance } from "../grid";
import { directionToward, randomValidDirection, createMoveContext } from "./movement";
import { Terrain } from "../board";
import type { GameTileHex, UnitPosition } from "../board";
import type { StoreProxy } from "../store";
import type { GameEvent } from "../game_event";
import type { State } from "../world";

const wolves = { id: "wolves", name: "Pack", color: PlayerColor.RED };

const PackLeaderUnit = Leader(Sightful(Movable(Damageable(Unit, 20), 2), 2));
const PackFollowerUnit = Follower(Sightful(Movable(Damageable(Unit, 15), 2), 1));

function makeTiles(cols = 5, rows = 5): GameTileHex[] {
  const grid = createGrid({
    rows,
    cols,
    tiles: Array.from({ length: cols }, (_, x) =>
      Array.from({ length: rows }, (_, y) => ({
        x,
        y,
        type: Terrain.WATER,
        textureName: "grass",
        sectionName: "none",
      }))
    ).flat(),
  });
  const tiles: GameTileHex[] = [];
  grid.forEach((hex) => tiles.push(hex as unknown as GameTileHex));
  return tiles;
}

function cubeAt(tiles: GameTileHex[], x: number, y: number) {
  return tiles.find((t) => {
    const c = t.coordinates();
    return c.x === x && c.y === y;
  })!.cube();
}

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
});
