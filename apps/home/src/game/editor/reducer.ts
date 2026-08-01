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

  const { worldWidth, worldHeight, minX, minY } = getGridBoundingBox(grid);

  return {
    tiles,
    worldWidth,
    worldHeight,
    minX,
    minY,
    // `board.rows`/`board.cols` were never round-tripped into State here —
    // harmless while nothing read state.rows/state.cols back (the old dead
    // EditorWorld tracked its own rows/columns separately in its GUI data),
    // but StageEditorWorld's Save reads state.rows/state.cols directly to
    // build the saved board file, so a save was silently writing rows:0,
    // cols:0 regardless of the real board size until this was added.
    rows: board.rows,
    cols: board.cols,
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
        // Mutate the field on the existing hex rather than spreading it into
        // a plain object: `state.tiles` entries are Honeycomb hexes whose
        // `.coordinates()`/`.cube()`/`.toPoint()`/`col`/`row` all live on the
        // per-grid Hex class's prototype — `{ ...tile, textureName }` silently
        // drops that prototype, so every later caller of those (e.g.
        // StageEditorWorld's Save) breaks. `action.x`/`action.y` are offset
        // coordinates, matching the hex's `col`/`row` (not its pixel `x`/`y`).
        tiles: state.tiles.map((tile) => {
          if (tile.col === action.x && tile.row === action.y) {
            tile.textureName = action.textureName;
          }

          return tile;
        }),
      };

    case EditorEventType.SetTileSectionName:
      return {
        ...state,
        // See SetTileTexture above for why this mutates in place.
        tiles: state.tiles.map((tile) => {
          if (tile.col === action.x && tile.row === action.y) {
            tile.sectionName = action.sectionName;
          }

          return tile;
        }),
      };
  }
}
