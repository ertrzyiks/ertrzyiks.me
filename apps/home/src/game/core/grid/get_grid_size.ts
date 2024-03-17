import type { Grid, Hex } from "honeycomb-grid";

export function getGridSize(grid: Grid<Hex<any>>) {
  const lastHex = grid.get(grid.length - 1);

  if (!lastHex) throw new Error("No hex found in grid");

  const pos = lastHex.cartesian();

  return { cols: pos.x, rows: pos.y };
}
