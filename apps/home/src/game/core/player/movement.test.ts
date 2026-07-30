import { describe, expect, test } from "vitest";
import type { CubeCoordinates } from "honeycomb-grid";
import { createGrid } from "../grid";
import { positionAt, hexDistance, cubeKey } from "../grid";
import { Terrain } from "../board";
import type { GameTileHex, UnitPosition } from "../board";
import { PlayerColor } from "./player";
import {
  createMoveContext,
  validDirections,
  moveRange,
  pathTo,
  validAttackTargets,
  directionToward,
  directionAway,
  randomValidDirection,
  moveSucceeded,
} from "./movement";
import { Direction } from "../direction";
import { Movable } from "../units/movable";
import { Damaging } from "../units/damaging";
import { Damageable } from "../units/damageable";
import { Unit } from "../units/unit";

const enemy = { id: "enemy", name: "Enemy", color: PlayerColor.RED };

const owner = { id: "x", name: "X", color: PlayerColor.RED };

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
  const tile = tiles.find((t) => {
    const c = t.coordinates();
    return c.x === x && c.y === y;
  })!;
  return tile.cube();
}

function ctxOf(tiles: GameTileHex[], units: UnitPosition[] = []) {
  return createMoveContext({ tiles, units });
}

describe("validDirections", () => {
  test("a centre hex on an open board has all six neighbours valid", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    expect(validDirections(center, ctxOf(tiles))).toHaveLength(6);
  });

  test("a corner hex has fewer valid directions (off-board neighbours excluded)", () => {
    const tiles = makeTiles(5, 5);
    const corner = cubeAt(tiles, 0, 0);
    expect(validDirections(corner, ctxOf(tiles)).length).toBeLessThan(6);
  });

  test("occupied neighbours are excluded", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const open = validDirections(center, ctxOf(tiles)).length;

    // Occupy one neighbour and confirm exactly one direction drops out.
    const blockerPos = positionAt(center, validDirections(center, ctxOf(tiles))[0]);
    const blocked = validDirections(
      center,
      ctxOf(tiles, [{ unit: { id: 1 } as any, position: blockerPos, owner }])
    );
    expect(blocked.length).toBe(open - 1);
  });
});

describe("directionToward", () => {
  test("returns a step that strictly reduces distance to the target", () => {
    const tiles = makeTiles(5, 5);
    const from = cubeAt(tiles, 0, 2);
    const target = cubeAt(tiles, 4, 2);

    const dir = directionToward(from, target, ctxOf(tiles));
    expect(dir).not.toBeNull();
    expect(hexDistance(positionAt(from, dir!), target)).toBeLessThan(
      hexDistance(from, target)
    );
  });

  test("returns null when already adjacent and the target tile is occupied", () => {
    const tiles = makeTiles(5, 5);
    const from = cubeAt(tiles, 2, 2);
    const targetDir = validDirections(from, ctxOf(tiles))[0];
    const target = positionAt(from, targetDir);

    // Target occupied -> no neighbour gets strictly closer than the current d=1.
    const dir = directionToward(
      from,
      target,
      ctxOf(tiles, [{ unit: { id: 9 } as any, position: target, owner }])
    );
    expect(dir).toBeNull();
  });
});

describe("directionAway", () => {
  test("returns a step that strictly increases distance from the target", () => {
    const tiles = makeTiles(5, 5);
    const from = cubeAt(tiles, 2, 2);
    const target = cubeAt(tiles, 1, 2);

    const dir = directionAway(from, target, ctxOf(tiles));
    expect(dir).not.toBeNull();
    expect(hexDistance(positionAt(from, dir!), target)).toBeGreaterThan(
      hexDistance(from, target)
    );
  });

  test("returns null when no legal step increases distance (cornered against target)", () => {
    const tiles = makeTiles(5, 5);
    const corner = cubeAt(tiles, 0, 0);
    // Standing on the target itself: every neighbour is distance 1 > 0, so a
    // move away exists. Instead, place the target far and surround the fleer.
    const target = cubeAt(tiles, 4, 4);
    const occupied = validDirections(corner, ctxOf(tiles)).map((d) => ({
      unit: { id: Math.random() } as any,
      position: positionAt(corner, d),
      owner,
    }));
    expect(directionAway(corner, target, ctxOf(tiles, occupied))).toBeNull();
  });
});

describe("moveRange", () => {
  function makeMover(budget: number) {
    const unit = new (Movable(Unit, budget))();
    unit.replenish();
    return unit;
  }

  test("with budget 1, returns only the in-bounds unoccupied neighbours", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const dests = moveRange(makeMover(1), center, { tiles, units: [] });
    expect(dests).toHaveLength(6);
    const keys = new Set(dests.map((d) => cubeKey(d)));
    for (const dir of validDirections(center, ctxOf(tiles))) {
      expect(keys.has(cubeKey(positionAt(center, dir)))).toBe(true);
    }
  });

  test("with budget 3, reaches hexes 2 and 3 steps away, not just the adjacent ring", () => {
    const tiles = makeTiles(9, 9);
    const center = cubeAt(tiles, 4, 4);
    const dests = moveRange(makeMover(3), center, { tiles, units: [] });

    expect(dests.some((d) => hexDistance(d, center) === 2)).toBe(true);
    expect(dests.some((d) => hexDistance(d, center) === 3)).toBe(true);
    // Never further than the budget allows, and never the starting hex itself.
    for (const d of dests) {
      expect(hexDistance(d, center)).toBeGreaterThanOrEqual(1);
      expect(hexDistance(d, center)).toBeLessThanOrEqual(3);
    }
  });

  test("excludes occupied neighbours (matches the reducer's occupancy rule)", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const blockerPos = positionAt(center, validDirections(center, ctxOf(tiles))[0]);
    const dests = moveRange(makeMover(3), center, {
      tiles,
      units: [{ unit: { id: 1 } as any, position: blockerPos, owner }],
    });
    expect(dests.map((d) => cubeKey(d))).not.toContain(cubeKey(blockerPos));
  });

  test("an occupied hex blocks the path through it, hiding hexes only reachable that way", () => {
    // A hand-built 3-hex corridor (start -> mid -> end) with nothing else
    // in bounds, so "end" has exactly one possible route in — through "mid".
    // A real board's hex grid has multiple 2-step paths between any two
    // hexes 2 apart, so this isolates the "can't pass through" behaviour
    // without that alternate-route noise.
    const start: CubeCoordinates = { q: 0, r: 0, s: 0 };
    const mid = positionAt(start, Direction.N);
    const end = positionAt(mid, Direction.N);
    const fakeTiles = [start, mid, end].map(
      (cube) => ({ cube: () => cube }) as unknown as GameTileHex
    );

    const dests = moveRange(makeMover(3), start, {
      tiles: fakeTiles,
      units: [{ unit: { id: 1 } as any, position: mid, owner }],
    });

    expect(dests.map((d) => cubeKey(d))).not.toContain(cubeKey(mid));
    expect(dests.map((d) => cubeKey(d))).not.toContain(cubeKey(end));
  });

  test("returns nothing when the unit has no movement budget (highlight absent)", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const spent = new (Movable(Unit, 3))(); // never replenished -> canMove() false
    expect(moveRange(spent, center, { tiles, units: [] })).toEqual([]);
  });

  test("returns nothing for a non-movable unit", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    expect(moveRange({ id: 7 }, center, { tiles, units: [] })).toEqual([]);
  });
});

describe("pathTo", () => {
  function makeMover(budget: number) {
    const unit = new (Movable(Unit, budget))();
    unit.replenish();
    return unit;
  }

  test("an adjacent target resolves to a single-step path", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const dir = validDirections(center, ctxOf(tiles))[0];
    const target = positionAt(center, dir);

    const path = pathTo(makeMover(3), center, target, { tiles, units: [] });
    expect(path).toEqual([dir]);
  });

  test("a target 2 steps away resolves to a 2-step path that actually lands on it", () => {
    const tiles = makeTiles(9, 9);
    const center = cubeAt(tiles, 4, 4);
    const dests = moveRange(makeMover(3), center, { tiles, units: [] });
    const twoStepTarget = dests.find((d) => hexDistance(d, center) === 2)!;

    const path = pathTo(makeMover(3), center, twoStepTarget, { tiles, units: [] });
    expect(path).toHaveLength(2);
    const landedAt = path!.reduce((pos, dir) => positionAt(pos, dir), center);
    expect(cubeKey(landedAt)).toBe(cubeKey(twoStepTarget));
  });

  test("returns null when the target is out of the unit's budget range", () => {
    const tiles = makeTiles(9, 9);
    const center = cubeAt(tiles, 4, 4);
    const dir = validDirections(center, ctxOf(tiles))[0];
    let farTarget = center;
    for (let i = 0; i < 4; i++) farTarget = positionAt(farTarget, dir);

    expect(pathTo(makeMover(3), center, farTarget, { tiles, units: [] })).toBeNull();
  });

  test("returns null when the only route is blocked by an occupied hex", () => {
    const start: CubeCoordinates = { q: 0, r: 0, s: 0 };
    const mid = positionAt(start, Direction.N);
    const end = positionAt(mid, Direction.N);
    const fakeTiles = [start, mid, end].map(
      (cube) => ({ cube: () => cube }) as unknown as GameTileHex
    );

    const path = pathTo(makeMover(3), start, end, {
      tiles: fakeTiles,
      units: [{ unit: { id: 1 } as any, position: mid, owner }],
    });
    expect(path).toBeNull();
  });

  test("returns null for the unit's own position", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    expect(pathTo(makeMover(3), center, center, { tiles, units: [] })).toBeNull();
  });

  test("returns null when the unit has no movement budget", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const dir = validDirections(center, ctxOf(tiles))[0];
    const target = positionAt(center, dir);
    const spent = new (Movable(Unit, 3))(); // never replenished
    expect(pathTo(spent, center, target, { tiles, units: [] })).toBeNull();
  });
});

describe("validAttackTargets", () => {
  function makeAttacker(attacksPerTurn: number) {
    const unit = new (Damaging(Unit, 1, attacksPerTurn))();
    unit.replenish();
    return unit;
  }

  function makeTarget() {
    const unit = new (Damageable(Unit, 5))();
    unit.replenish();
    return unit;
  }

  test("returns adjacent enemy Damageable units when the attacker has a charge", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const targetPos = positionAt(center, validDirections(center, ctxOf(tiles))[0]);
    const target = { unit: makeTarget(), position: targetPos, owner: enemy };

    const targets = validAttackTargets(makeAttacker(1), center, "human", {
      units: [target],
    });

    expect(targets.map((t) => cubeKey(t))).toEqual([cubeKey(targetPos)]);
  });

  test("excludes non-adjacent enemy units", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const farPos = cubeAt(tiles, 4, 4);
    const target = { unit: makeTarget(), position: farPos, owner: enemy };

    expect(
      validAttackTargets(makeAttacker(1), center, "human", { units: [target] })
    ).toEqual([]);
  });

  test("excludes friendly units even when adjacent", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const friendlyPos = positionAt(center, validDirections(center, ctxOf(tiles))[0]);
    const friendly = { unit: makeTarget(), position: friendlyPos, owner: { id: "human", name: "Human", color: PlayerColor.BLUE } };

    expect(
      validAttackTargets(makeAttacker(1), center, "human", { units: [friendly] })
    ).toEqual([]);
  });

  test("excludes adjacent enemy units that are not Damageable", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const npcPos = positionAt(center, validDirections(center, ctxOf(tiles))[0]);
    const npc = { unit: new Unit() as any, position: npcPos, owner: enemy };

    expect(
      validAttackTargets(makeAttacker(1), center, "human", { units: [npc] })
    ).toEqual([]);
  });

  test("returns nothing when the attacker has no attack charge left", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const targetPos = positionAt(center, validDirections(center, ctxOf(tiles))[0]);
    const target = { unit: makeTarget(), position: targetPos, owner: enemy };
    const spent = new (Damaging(Unit, 1, 1))(); // never replenished -> canAttack() false

    expect(validAttackTargets(spent, center, "human", { units: [target] })).toEqual([]);
  });

  test("returns nothing for a non-damaging unit", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    expect(validAttackTargets({ id: 7 }, center, "human", { units: [] })).toEqual([]);
  });
});

describe("randomValidDirection", () => {
  test("avoids backtracking: never returns the opposite of cameFrom when alternatives exist", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    // cameFrom = N means the unit arrived by moving N, so it came from the S
    // hex; the back-step is opposite(N) = S. It should never be chosen.
    for (let i = 0; i < 20; i++) {
      const dir = randomValidDirection(center, ctxOf(tiles), Direction.N);
      expect(dir).not.toBe(Direction.S);
    }
  });

  test("rng selects deterministically from the preferred pool", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const dir = randomValidDirection(center, ctxOf(tiles), null, () => 0);
    // rng() === 0 -> first element of the valid-direction pool.
    expect(dir).toBe(validDirections(center, ctxOf(tiles))[0]);
  });

  test("returns null when completely boxed in", () => {
    const tiles = makeTiles(5, 5);
    const center = cubeAt(tiles, 2, 2);
    const occupied = validDirections(center, ctxOf(tiles)).map((d) => ({
      unit: { id: Math.random() } as any,
      position: positionAt(center, d),
      owner,
    }));
    expect(randomValidDirection(center, ctxOf(tiles, occupied))).toBeNull();
  });
});

describe("moveSucceeded", () => {
  test("true when the unit's state position matches the attempted destination", () => {
    const tiles = makeTiles(5, 5);
    const unit = { id: 1 } as any;
    const destination = cubeAt(tiles, 2, 2);
    const state = { units: [{ unit, position: destination, owner }] };
    expect(moveSucceeded(unit, destination, state)).toBe(true);
  });

  test("false when the reducer rejected the move (unit still at its old position)", () => {
    const tiles = makeTiles(5, 5);
    const unit = { id: 1 } as any;
    const oldPosition = cubeAt(tiles, 1, 1);
    const attemptedDestination = cubeAt(tiles, 2, 2);
    const state = { units: [{ unit, position: oldPosition, owner }] };
    expect(moveSucceeded(unit, attemptedDestination, state)).toBe(false);
  });

  test("false when the unit isn't found in state at all", () => {
    const tiles = makeTiles(5, 5);
    const unit = { id: 1 } as any;
    const destination = cubeAt(tiles, 2, 2);
    expect(moveSucceeded(unit, destination, { units: [] })).toBe(false);
  });
});
