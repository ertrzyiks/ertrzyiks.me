import {
  defineHex,
  Grid as HoneycombGrid,
  rectangle,
  Orientation,
  type CubeCoordinates,
  type Point,
} from "honeycomb-grid";
import { Terrain, type Board, type GameTile } from "../board";

// Real pixel/world hex radius (see helpers.ts's pointToCube, which needs the
// same size to invert a screen click into a hex).
export const TILE_SIZE = 50;

const HexBase = defineHex({
  dimensions: TILE_SIZE,
  orientation: Orientation.FLAT,
});

// honeycomb-grid v4 replaced v1's extendHex()/method-call API (.cube(),
// .coordinates(), .toPoint()) with a plain class exposing getters (q/r/s,
// col/row, x/y). These wrappers keep that v1 surface alive so the rest of
// the codebase (and its tests) don't need to know the underlying library was
// rewritten. `corners`/`width`/`height` are kept as v4's own getters (no v1
// wrapper) since they're only read in one place (get_grid_bounding_box.ts).
class Hex extends HexBase implements GameTile {
  type: Terrain = Terrain.WATER;
  textureName = "";
  sectionName = "";

  cube(): CubeCoordinates {
    return { q: this.q, r: this.r, s: this.s };
  }

  coordinates(): Point {
    return { x: this.col, y: this.row };
  }

  cartesian(): Point {
    return this.coordinates();
  }

  toPoint(): Point {
    return { x: this.x, y: this.y };
  }
}

export { Hex };

// Hoisted to module scope (not per-createGrid() call) so helpers.ts's
// pointToCube can invert a pixel point back to a hex via this exact same
// factory. It's fine that this instance holds no hexes: pointToHex only
// needs the hex class's own settings (size/orientation) for its geometry.
export const Grid = new HoneycombGrid(Hex);

export function createGrid(board: Board) {
  const grid = new HoneycombGrid(
    Hex,
    rectangle({ width: board.cols, height: board.rows })
  );

  board.tiles.forEach((tile) => {
    const width = tile.width || 1;
    const height = tile.height || 1;

    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const hex = grid.getHex({ col: tile.x + dx, row: tile.y + dy });

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
