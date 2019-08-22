import {EditorEvent, EditorEventType} from './editor_event'
import {State} from '../core/world'
import {Board, BoardTile, Terrain} from '../core/board'
import {createGrid, getGridBoundingBox} from '../core/grid'

function stateFromBoard(board: Board) {
  const grid = createGrid(board)

  const tiles = grid.reduce((acc, hex) => {
    acc.push(hex)
    return acc
  }, [])

  const {worldWidth, worldHeight} = getGridBoundingBox(grid)

  return {
    tiles,
    worldWidth,
    worldHeight
  }
}

const getTile = (tiles: Array<BoardTile>, x: number, y: number) => {
  const found = tiles.filter(tile => tile.x === x && tile.y === y)

  if (found.length > 0) {
    return found[0]
  }
}

export function editorReducer(state: State, action: EditorEvent) {
  switch(action.type) {
    case EditorEventType.SetSize:
      let tiles = []

      for (let x = 0; x < action.cols; x++) {
        for (let y = 0; y < action.rows; y++) {
          tiles.push({
            x,
            y,
            type: Terrain.WATER,
            textureName: 'water',
            ...getTile(state.tiles, x, y)
          })
        }
      }

      const board = {
        cols: action.cols,
        rows: action.rows,
        tiles
      }

      return {
        ...state,
        ...stateFromBoard(board)
      }

    case EditorEventType.LoadBoard:
      return {
        ...state,
        ...stateFromBoard(action.data)
      }
  }

  return state
}
