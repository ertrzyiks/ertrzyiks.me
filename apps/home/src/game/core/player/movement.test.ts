import { describe, expect, test } from "vitest";
import { createGrid } from "../grid";
import { positionAt, hexDistance } from "../grid";
import { Terrain } from "../board";
import type { GameTileHex, UnitPosition } from "../board";
import { PlayerColor } from "./player";
import {
  createMoveContext,
  validDirections,
  directionToward,
  directionAway,
  randomValidDirection,
} from "./movement";
import { Direction } from "../direction";

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
