import {extendHex, defineGrid} from 'honeycomb-grid'
import {Board} from '../board'

export function createGrid(board: Board) {
  const Hex = extendHex({
    size: board.tile_size,
    orientation: 'flat',
    terrain: null
  })

  const Grid = defineGrid(Hex)

  const grid = Grid.rectangle({
    width: board.cols,
    height: board.rows,
  })

  board.terrain.forEach(tile => {
    const width = tile.width || 1
    const height = tile.height || 1

    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        grid.get({x: tile.x + dx, y: tile.y + dy}).terrain = tile.type
      }
    }
  })

  return grid
}
