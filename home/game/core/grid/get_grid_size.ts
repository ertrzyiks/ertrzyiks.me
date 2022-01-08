import {Grid, Hex} from 'honeycomb-grid'

export function getGridSize(grid: Grid<Hex<any>>) {
  const lastHex = grid.get(grid.length - 1)
  const pos = lastHex.cartesian()

  return {cols: pos.x, rows: pos.y}
}
