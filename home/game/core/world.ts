import {Grid} from 'honeycomb-grid'
import {GameEvent} from './game_event'
import {getGridBoundingBox, getGridSize} from './grid'
import {Player} from './player'
import {createStore, Store} from './store'
import {GameTileHex, UnitPosition} from './board'
import {gameReducer} from './reducers'

export type WorldUpdateCallback = (state: State, action: GameEvent) => void

export interface State {
  players: Array<{id: string, name: string}>
  currentPlayerIndex: number | null
  currentPlayer: Player | null
  worldWidth: number
  worldHeight: number
  cols: number
  rows: number
  tiles: Array<GameTileHex>
  units: Array<UnitPosition>
}

export class World {
  store: Store<GameEvent, State>

  constructor(grid: Grid) {
    const tiles = grid.reduce((acc, hex) => {
      acc.push(hex)
      return acc
    }, [])

    const {worldWidth, worldHeight} = getGridBoundingBox(grid)
    const {cols, rows} = getGridSize(grid)

    this.store = createStore(gameReducer, {
      players: [],
      currentPlayerIndex: null,
      currentPlayer: null,
      tiles,
      units: [],
      worldWidth,
      worldHeight,
      cols,
      rows
    })
  }

  getState() {
    return this.store.getState()
  }

  dispatch(event: GameEvent) {
    this.store.dispatch(event)
  }

  subscribe(fn: WorldUpdateCallback) {
    this.store.subscribe(fn)
  }

  tileBySection(sectionName: string) {
    return this.getState().tiles[0]
  }

  // TODO: fix it
  unitsOf(player: Player) {
    return this.getState().units
  }
}
