import { describe, expect, test } from "vitest";
import { createGrid, TILE_SIZE } from "./create_grid";
import { getGridBoundingBox } from "./get_grid_bounding_box";
import { Terrain, type Board } from "../board";

function makeBoard(cols: number, rows: number): Board {
  return {
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
  };
}

describe("getGridBoundingBox", () => {
  test("a single hex's bounding box is its own size, not inflated by its position", () => {
    const grid = createGrid(makeBoard(1, 1));
    const { worldWidth, worldHeight } = getGridBoundingBox(grid);

    // A single flat-top hex sits at the origin: its furthest corner is half
    // its own width/height away, regardless of TILE_SIZE.
    expect(worldWidth).toBeCloseTo(TILE_SIZE, 0);
    expect(worldHeight).toBeCloseTo((TILE_SIZE * Math.sqrt(3)) / 2, 0);
  });

  test("bounding box tracks a multi-hex grid's real extent, not roughly double it", () => {
    // Matches board1.json's real size (10 cols x 8 rows) — this is the exact
    // shape that surfaced the bug: MainWorld's camera centering
    // (main/game_world.ts) used to aim at a point ~2x past the board's real
    // center, because this function added a hex's own absolute position on
    // top of its already-absolute corner coordinates (honeycomb-grid v4's
    // `corners` getter returns world-space points, not offsets relative to
    // the hex — see this function's own comment for the full explanation).
    const grid = createGrid(makeBoard(10, 8));
    const { worldWidth, worldHeight } = getGridBoundingBox(grid);

    const positions = grid.toArray().map((h) => h.toPoint());
    const maxTileX = Math.max(...positions.map((p) => p.x));
    const maxTileY = Math.max(...positions.map((p) => p.y));

    // The bounding box is a modest hex-sized margin beyond the furthest
    // tile's own center — never anywhere near double it. A flat-top hex's
    // furthest corner sits exactly TILE_SIZE past its own center, so this
    // margin is a tight bound, not a loose one.
    expect(worldWidth).toBeGreaterThan(maxTileX);
    expect(worldWidth).toBeLessThanOrEqual(maxTileX + TILE_SIZE);
    expect(worldHeight).toBeGreaterThan(maxTileY);
    expect(worldHeight).toBeLessThanOrEqual(maxTileY + TILE_SIZE);
  });

  test("minX/minY report the grid's true top-left corner, not the origin", () => {
    // The col/row 0 hex's own corners reach half a tile-width/height above
    // and left of its center, so the grid's real top-left corner sits at
    // negative X/Y — not [0, 0]. MainWorld's camera centering (main/game_world.ts)
    // used to assume [0, 0] was the top-left corner, aiming the camera past
    // the board's true center and clipping the top row off-screen.
    const grid = createGrid(makeBoard(10, 8));
    const { minX, minY } = getGridBoundingBox(grid);

    expect(minX).toBeLessThan(0);
    expect(minY).toBeLessThan(0);
    // A flat-top hex's leftmost/topmost corner sits exactly TILE_SIZE (its
    // own half-width) / half its height past its own center — never further.
    expect(minX).toBeGreaterThanOrEqual(-TILE_SIZE);
    expect(minY).toBeGreaterThanOrEqual(-(TILE_SIZE * Math.sqrt(3)) / 2);
  });
});
