import { extendHex, defineGrid } from "honeycomb-grid";
import { Terrain, type Board } from "../board";

const TILE_SIZE = 46;

export function createGrid(board: Board) {
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

  const Grid = defineGrid(Hex);

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
