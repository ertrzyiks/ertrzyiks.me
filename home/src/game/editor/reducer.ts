import {EditorEvent, EditorEventType} from './editor_event'
import {State} from '../core/world'
import {Board, Terrain} from '../core/board'
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

export function editorReducer(state: State, action: EditorEvent) {
  switch(action.type) {
    case EditorEventType.SetSize:
      const board = {
        cols: action.cols,
        rows: action.rows,
        tiles: [{
          x: 0, y: 0, width: action.cols, height: action.rows, type: Terrain.WATER, textureName: 'water'
        }]
      }

      return {
        ...state,
        ...stateFromBoard(board)
      }

    case EditorEventType.LoadBoard:
      return {
        ...state,
        ...stateFromBoard({
          ...action.data,
          tiles: [{
            x: 0, y: 0, width: action.data.cols, height: action.data.rows, type: Terrain.WATER, textureName: 'water'
          }]
        })
      }
  }

  return state
}
