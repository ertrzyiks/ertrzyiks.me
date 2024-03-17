import { type EditorEvent, EditorEventType } from "./editor_event";
import type { State } from "../core/world";
import { type Board, Terrain } from "../core/board";
import { createGrid, getGridBoundingBox } from "../core/grid";
import { getTile } from "./utils";
import type { Grid } from "honeycomb-grid";

type GridElement<T> = T extends Grid<infer H> ? H : never;
function stateFromBoard(board: Board) {
  const grid = createGrid(board);

  const tiles = grid.reduce((acc, hex) => {
    acc.push(hex);
    return acc;
  }, [] as GridElement<typeof grid>[]);

  const { worldWidth, worldHeight } = getGridBoundingBox(grid);

  return {
    tiles,
    worldWidth,
    worldHeight,
  };
}

export function editorReducer(state: State, action: EditorEvent): State {
  switch (action.type) {
    case EditorEventType.SetSize:
      let tiles = [];

      for (let x = 0; x < action.cols; x++) {
        for (let y = 0; y < action.rows; y++) {
          tiles.push({
            x,
            y,
            type: Terrain.WATER,
            textureName: "water",
            sectionName: "none",
            ...getTile(state.tiles, x, y),
          });
        }
      }

      const board = {
        cols: action.cols,
        rows: action.rows,
        tiles,
      };

      return {
        ...state,
        ...stateFromBoard(board),
      };

    case EditorEventType.LoadBoard:
      return {
        ...state,
        ...stateFromBoard(action.data),
      };

    case EditorEventType.SetTileTexture:
      return {
        ...state,
        tiles: state.tiles.map((tile) => {
          if (tile.x === action.x && tile.y === action.y) {
            return { ...tile, textureName: action.textureName };
          }

          return tile;
        }),
      };

    case EditorEventType.SetTileSectionName:
      return {
        ...state,
        tiles: state.tiles.map((tile) => {
          if (tile.x === action.x && tile.y === action.y) {
            return { ...tile, sectionName: action.sectionName };
          }

          return tile;
        }),
      };
  }
}
