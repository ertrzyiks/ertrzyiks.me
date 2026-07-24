import { createGrid } from "./create_grid";
import { Terrain } from "../board";
import type { GameTileHex } from "../board";

/**
 * A square, fully-open, unlabeled test board — every tile plain grass, no
 * sections. Shared by AI-behavior tests (flee/pack/seeker) that only care
 * about hex geometry (bounds, distance, adjacency), not board content.
 */
export function makeTiles(cols = 5, rows = 5): GameTileHex[] {
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

/** Look up a `makeTiles` tile by its offset coordinates and return its cube position. */
export function cubeAt(tiles: GameTileHex[], x: number, y: number) {
  return tiles.find((t) => {
    const c = t.coordinates();
    return c.x === x && c.y === y;
  })!.cube();
}
