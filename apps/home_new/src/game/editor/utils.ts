import {BoardTile} from '../core'

export function getTile (tiles: Array<BoardTile>, x: number, y: number) {
  const found = tiles.filter(tile => tile.x === x && tile.y === y)

  if (found.length > 0) {
    return found[0]
  }
}
