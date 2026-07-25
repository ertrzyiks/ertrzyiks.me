import { extendHex, defineGrid } from "honeycomb-grid";
import { Terrain, type Board } from "../board";

// Real pixel/world hex radius (see helpers.ts's pointToCube, which needs the
// same size to invert a screen click into a hex).
export const TILE_SIZE = 50;

const Hex = extendHex<{
  size: number;
  orientation: "flat";
  type: Terrain;
  textureName: string;
  sectionName: string;
}>({
  size: TILE_SIZE,
  orientation: "flat",
  type: Terrain.WATER,
  textureName: "",
  sectionName: "",
});

// Hoisted to module scope (not per-createGrid() call) so helpers.ts's
// pointToCube can invert a pixel point back to a hex via this exact same
// factory. Also exported directly: pointToCube needs Hex().width()/height()
// to correct for a toPoint()/pointToHex() coordinate-convention mismatch
// (see helpers.ts).
export { Hex };
export const Grid = defineGrid(Hex);

export function createGrid(board: Board) {
  const grid = Grid.rectangle({
    width: board.cols,
    height: board.rows,
  });

  board.tiles.forEach((tile) => {
    const width = tile.width || 1;
    const height = tile.height || 1;

    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const hex = grid.get({ x: tile.x + dx, y: tile.y + dy });

        if (!hex) {
          throw new Error(`No hex found at ${tile.x + dx}, ${tile.y + dy}`);
        }

        hex.type = tile.type;
        hex.textureName = tile.textureName;
        hex.sectionName = tile.sectionName;
      }
    }
  });

  return grid;
}
