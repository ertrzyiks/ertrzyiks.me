import { describe, expect, test } from "vitest";
import { SeekerBehavior } from "./seeker_behavior";
import {
  PlayerActionType,
  type PlayerAction,
  type MoveAction,
  type AttackAction,
} from "../player_action";
import { PlayerColor } from "./player";
import { Unit, Movable, Damageable, Damaging, Sightful } from "../units";
import { positionAt, hexDistance } from "../grid";
import { makeTiles, cubeAt } from "../grid/test_helpers";
import { directions } from "../direction";
import type { GameTileHex, UnitPosition } from "../board";
import type { StoreProxy } from "../store";
import type { GameEvent } from "../game_event";
import type { State } from "../world";

const human = { id: "human", name: "Whirley", color: PlayerColor.BLUE };
const bandits = { id: "bandits", name: "Bandits", color: PlayerColor.RED };
const wandererOwner = { id: "wanderer", name: "Wanderer", color: PlayerColor.GREEN };

const BanditUnit = Sightful(Movable(Damaging(Damageable(Unit, 25), 8), 2), 1);
const HeroUnit = Sightful(Movable(Damageable(Unit, 30), 3), 2);
const WandererUnit = Sightful(Movable(Unit, 3), 2);

// `units` is the bandit player's own roster (proxy-filtered); `allUnits` is the
// full board the way the per-player proxy exposes it, so the behavior can see
// the targets it hunts.
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
const attacks = (d: PlayerAction[]) =>
  d.filter((a): a is AttackAction => a.type === PlayerActionType.Attack);

function freshBandit() {
  const u = new BanditUnit();
  u.replenish();
  return u;
}

describe("SeekerBehavior", () => {
  test("always ends the turn after acting", () => {
    const { store, dispatched } = makeStore([], [], makeTiles());
    new SeekerBehavior(store, { huntFor: ["human"] }).takeActions();
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });

  test("moves toward the nearest hunted unit", () => {
    const tiles = makeTiles();
    const bandit = freshBandit();
    const hero = new HeroUnit();

    const banditPos = cubeAt(tiles, 0, 2);
    const heroPos = cubeAt(tiles, 4, 2);
    const bUnit: UnitPosition = { unit: bandit, position: banditPos, owner: bandits };
    const hUnit: UnitPosition = { unit: hero, position: heroPos, owner: human };

    const { store, dispatched } = makeStore([bUnit], [bUnit, hUnit], tiles);
    new SeekerBehavior(store, { huntFor: ["human"] }).takeActions();

    const m = moves(dispatched);
    expect(m).toHaveLength(1);
    expect(m[0].unit).toBe(bandit);
    const before = hexDistance(banditPos, heroPos);
    const after = hexDistance(positionAt(banditPos, m[0].direction), heroPos);
    expect(after).toBeLessThan(before);
  });

  test("does not move when already adjacent to a hunted unit; attacks instead", () => {
    const tiles = makeTiles();
    const bandit = freshBandit();
    const hero = new HeroUnit();

    const banditPos = cubeAt(tiles, 2, 2);
    const heroPos = cubeAt(tiles, 1, 2); // adjacent
    const bUnit: UnitPosition = { unit: bandit, position: banditPos, owner: bandits };
    const hUnit: UnitPosition = { unit: hero, position: heroPos, owner: human };

    const { store, dispatched } = makeStore([bUnit], [bUnit, hUnit], tiles);
    new SeekerBehavior(store, { huntFor: ["human"] }).takeActions();

    expect(moves(dispatched)).toHaveLength(0);
    const a = attacks(dispatched);
    expect(a).toHaveLength(1);
    expect(a[0].unit).toBe(bandit);
    expect(a[0].position).toEqual(heroPos);
  });

  test("does not attack when out of attack charges (and still does not move)", () => {
    const tiles = makeTiles();
    const bandit = new BanditUnit();
    bandit.replenish();
    bandit.useAttack(); // spend this turn's only charge

    const hero = new HeroUnit();
    const banditPos = cubeAt(tiles, 2, 2);
    const heroPos = cubeAt(tiles, 1, 2); // adjacent

    const bUnit: UnitPosition = { unit: bandit, position: banditPos, owner: bandits };
    const hUnit: UnitPosition = { unit: hero, position: heroPos, owner: human };

    const { store, dispatched } = makeStore([bUnit], [bUnit, hUnit], tiles);
    new SeekerBehavior(store, { huntFor: ["human"] }).takeActions();

    expect(moves(dispatched)).toHaveLength(0);
    expect(attacks(dispatched)).toHaveLength(0);
    expect(dispatched.at(-1)!.type).toBe(PlayerActionType.EndTurn);
  });

  test("hunts the human, not the Wanderer", () => {
    const tiles = makeTiles();
    const bandit = freshBandit();
    const hero = new HeroUnit();
    const wanderer = new WandererUnit();

    const banditPos = cubeAt(tiles, 0, 2);
    const heroPos = cubeAt(tiles, 2, 2); // human, non-adjacent but nearest hunted
    const wandererPos = cubeAt(tiles, 4, 2); // Wanderer farther away, ignored by huntFor

    const bUnit: UnitPosition = { unit: bandit, position: banditPos, owner: bandits };
    const hUnit: UnitPosition = { unit: hero, position: heroPos, owner: human };
    const wUnit: UnitPosition = { unit: wanderer, position: wandererPos, owner: wandererOwner };

    const { store, dispatched } = makeStore(
      [bUnit],
      [bUnit, hUnit, wUnit],
      tiles
    );
    new SeekerBehavior(store, { huntFor: ["human"] }).takeActions();

    const m = moves(dispatched);
    expect(m).toHaveLength(1);
    // Hunting the human means closing on heroPos, even though the Wanderer
    // sits farther away at x=4.
    const after = hexDistance(positionAt(banditPos, m[0].direction), heroPos);
    expect(after).toBeLessThan(hexDistance(banditPos, heroPos));
  });

  test("stays put when boxed in (no valid step)", () => {
    const tiles = makeTiles();
    const bandit = freshBandit();
    const hero = new HeroUnit();

    const banditPos = cubeAt(tiles, 2, 2);
    const bUnit: UnitPosition = { unit: bandit, position: banditPos, owner: bandits };
    const hUnit: UnitPosition = {
      unit: hero,
      position: cubeAt(tiles, 0, 0),
      owner: human,
    };

    // Occupy every neighbouring hex so there is no valid direction at all.
    const blockers: UnitPosition[] = directions.map((d) => ({
      unit: new HeroUnit(),
      position: positionAt(banditPos, d),
      owner: bandits,
    }));

    const { store, dispatched } = makeStore(
      [bUnit],
      [bUnit, hUnit, ...blockers],
      tiles
    );
    new SeekerBehavior(store, { huntFor: ["human"] }).takeActions();

    expect(moves(dispatched)).toHaveLength(0);
    expect(dispatched.at(-1)!.type).toBe(PlayerActionType.EndTurn);
  });

  test("skips a unit with no movement budget but still ends the turn", () => {
    const tiles = makeTiles();
    const bandit = new BanditUnit(); // never replenished → 0 budget
    const hero = new HeroUnit();

    const bUnit: UnitPosition = {
      unit: bandit,
      position: cubeAt(tiles, 0, 2),
      owner: bandits,
    };
    const hUnit: UnitPosition = {
      unit: hero,
      position: cubeAt(tiles, 4, 2),
      owner: human,
    };

    const { store, dispatched } = makeStore([bUnit], [bUnit, hUnit], tiles);
    new SeekerBehavior(store, { huntFor: ["human"] }).takeActions();

    expect(moves(dispatched)).toHaveLength(0);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });

  test("each bandit acts independently toward its own nearest target", () => {
    const tiles = makeTiles(9, 5);
    const banditA = freshBandit();
    const banditB = freshBandit();
    const heroNear = new HeroUnit();
    const heroFar = new HeroUnit();

    // Two bandit/target pairs at opposite ends of a wide board, each pair
    // non-adjacent (so the move branch fires) and far enough apart that each
    // bandit's nearest target is unambiguously its own, not the other pair's.
    const aPos = cubeAt(tiles, 0, 2);
    const nearPos = cubeAt(tiles, 2, 2); // closest to banditA
    const bPos = cubeAt(tiles, 8, 2);
    const farPos = cubeAt(tiles, 6, 2); // closest to banditB

    const aUnit: UnitPosition = { unit: banditA, position: aPos, owner: bandits };
    const bUnit: UnitPosition = { unit: banditB, position: bPos, owner: bandits };
    const nearUnit: UnitPosition = { unit: heroNear, position: nearPos, owner: human };
    const farUnit: UnitPosition = { unit: heroFar, position: farPos, owner: human };

    const { store, dispatched } = makeStore(
      [aUnit, bUnit],
      [aUnit, bUnit, nearUnit, farUnit],
      tiles
    );
    new SeekerBehavior(store, { huntFor: ["human"] }).takeActions();

    const m = moves(dispatched);
    expect(m).toHaveLength(2);
    const aMove = m.find((mv) => mv.unit === banditA)!;
    const bMove = m.find((mv) => mv.unit === banditB)!;
    expect(hexDistance(positionAt(aPos, aMove.direction), nearPos)).toBeLessThan(
      hexDistance(aPos, nearPos)
    );
    expect(hexDistance(positionAt(bPos, bMove.direction), farPos)).toBeLessThan(
      hexDistance(bPos, farPos)
    );
  });
});
