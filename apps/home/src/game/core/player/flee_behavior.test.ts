import { describe, expect, test } from "vitest";
import { FleeBehavior } from "./flee_behavior";
import {
  PlayerActionType,
  type PlayerAction,
  type MoveAction,
} from "../player_action";
import { PlayerColor } from "./player";
import { Unit, Movable, Damageable, Sightful } from "../units";
import { createGrid, positionAt, hexDistance } from "../grid";
import { directions } from "../direction";
import { Terrain } from "../board";
import type { GameTileHex, UnitPosition } from "../board";
import type { StoreProxy } from "../store";
import type { GameEvent } from "../game_event";
import type { State } from "../world";

const human = { id: "human", name: "Whirley", color: PlayerColor.BLUE };
const wolves = { id: "wolves", name: "Pack", color: PlayerColor.RED };
const wandererOwner = { id: "wanderer", name: "Wanderer", color: PlayerColor.GREEN };

const WandererUnit = Sightful(Movable(Unit, 3), 2);
const HeroUnit = Sightful(Movable(Damageable(Unit, 30), 3), 2);

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

// `units` is the Wanderer player's own roster (proxy-filtered); `allUnits` is the
// full board the way the per-player proxy exposes it, so the behavior can see the
// threats it must flee from.
function makeStore(
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

const moves = (d: PlayerAction[]) =>
  d.filter((a): a is MoveAction => a.type === PlayerActionType.Move);

function freshWanderer() {
  const u = new WandererUnit();
  u.replenish();
  return u;
}

describe("FleeBehavior", () => {
  test("always ends the turn after acting", () => {
    const { store, dispatched } = makeStore([], [], makeTiles());
    new FleeBehavior(store, { fleeFrom: ["human"] }).takeActions();
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });

  test("steps away from the nearest player unit", () => {
    const tiles = makeTiles();
    const wanderer = freshWanderer();
    const hero = new HeroUnit();

    const wandererPos = cubeAt(tiles, 2, 2);
    const heroPos = cubeAt(tiles, 0, 2);
    const wUnit: UnitPosition = { unit: wanderer, position: wandererPos, owner: wandererOwner };
    const hUnit: UnitPosition = { unit: hero, position: heroPos, owner: human };

    const { store, dispatched } = makeStore([wUnit], [wUnit, hUnit], tiles);
    new FleeBehavior(store, { fleeFrom: ["human"] }).takeActions();

    const m = moves(dispatched);
    expect(m).toHaveLength(1);
    expect(m[0].unit).toBe(wanderer);
    // The chosen step must strictly increase distance from the player.
    const before = hexDistance(wandererPos, heroPos);
    const after = hexDistance(positionAt(wandererPos, m[0].direction), heroPos);
    expect(after).toBeGreaterThan(before);
  });

  test("never attacks, even with an adjacent player unit", () => {
    const tiles = makeTiles();
    const wanderer = freshWanderer();
    const hero = new HeroUnit();

    const wandererPos = cubeAt(tiles, 2, 2);
    const heroPos = cubeAt(tiles, 1, 2); // adjacent
    const wUnit: UnitPosition = { unit: wanderer, position: wandererPos, owner: wandererOwner };
    const hUnit: UnitPosition = { unit: hero, position: heroPos, owner: human };

    const { store, dispatched } = makeStore([wUnit], [wUnit, hUnit], tiles);
    new FleeBehavior(store, { fleeFrom: ["human"] }).takeActions();

    expect(
      dispatched.some((a) => a.type === PlayerActionType.Attack)
    ).toBe(false);
  });

  test("flees from the player, not from the wolves", () => {
    const tiles = makeTiles();
    const wanderer = freshWanderer();
    const hero = new HeroUnit();
    const wolf = new HeroUnit(); // stand-in board occupant owned by the wolves

    const wandererPos = cubeAt(tiles, 2, 2);
    const heroPos = cubeAt(tiles, 1, 2); // player just to the left (nearest threat)
    const wolfPos = cubeAt(tiles, 4, 2); // wolf to the right, ignored by fleeFrom
    const wUnit: UnitPosition = { unit: wanderer, position: wandererPos, owner: wandererOwner };
    const hUnit: UnitPosition = { unit: hero, position: heroPos, owner: human };
    const wolfUnit: UnitPosition = { unit: wolf, position: wolfPos, owner: wolves };

    const { store, dispatched } = makeStore(
      [wUnit],
      [wUnit, hUnit, wolfUnit],
      tiles
    );
    new FleeBehavior(store, { fleeFrom: ["human"] }).takeActions();

    const m = moves(dispatched);
    expect(m).toHaveLength(1);
    // Fleeing the human means moving away from x=1, i.e. increasing distance to
    // the human even though that carries the Wanderer toward the (ignored) wolf.
    const after = hexDistance(positionAt(wandererPos, m[0].direction), heroPos);
    expect(after).toBeGreaterThan(hexDistance(wandererPos, heroPos));
  });

  test("stays put when boxed in (no valid step)", () => {
    const tiles = makeTiles();
    const wanderer = freshWanderer();
    const hero = new HeroUnit();

    const wandererPos = cubeAt(tiles, 2, 2);
    const wUnit: UnitPosition = { unit: wanderer, position: wandererPos, owner: wandererOwner };
    const hUnit: UnitPosition = {
      unit: hero,
      position: cubeAt(tiles, 0, 0),
      owner: human,
    };

    // Occupy every neighbouring hex so there is no valid direction at all.
    const blockers: UnitPosition[] = directions.map((d) => ({
      unit: new HeroUnit(),
      position: positionAt(wandererPos, d),
      owner: wolves,
    }));

    const { store, dispatched } = makeStore(
      [wUnit],
      [wUnit, hUnit, ...blockers],
      tiles
    );
    new FleeBehavior(store, { fleeFrom: ["human"] }).takeActions();

    expect(moves(dispatched)).toHaveLength(0);
    expect(dispatched.at(-1)!.type).toBe(PlayerActionType.EndTurn);
  });

  test("skips a unit with no movement budget but still ends the turn", () => {
    const tiles = makeTiles();
    const wanderer = new WandererUnit(); // never replenished → 0 budget
    const hero = new HeroUnit();

    const wUnit: UnitPosition = {
      unit: wanderer,
      position: cubeAt(tiles, 2, 2),
      owner: wandererOwner,
    };
    const hUnit: UnitPosition = {
      unit: hero,
      position: cubeAt(tiles, 0, 2),
      owner: human,
    };

    const { store, dispatched } = makeStore([wUnit], [wUnit, hUnit], tiles);
    new FleeBehavior(store, { fleeFrom: ["human"] }).takeActions();

    expect(moves(dispatched)).toHaveLength(0);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });
});
