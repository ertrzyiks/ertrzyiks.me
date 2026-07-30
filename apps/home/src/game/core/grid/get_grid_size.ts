import type { Grid } from "honeycomb-grid";
import type { GameTileHex } from "../board";

export function getGridSize(grid: Grid<GameTileHex>) {
  const lastHex = grid.toArray()[grid.size - 1];

  if (!lastHex) throw new Error("No hex found in grid");

  const pos = lastHex.cartesian();

  return { cols: pos.x, rows: pos.y };
}
