import {Grid} from 'honeycomb-grid'
import {GameEvent} from './game_event'
import {getGridBoundingBox} from './grid'
import {Player} from './player'
import {Store} from './store'
import {GameTileHex, UnitPosition} from './board'
import {gameReducer} from './reducers'

export type WorldUpdateCallback = (state: State, action: GameEvent) => void

export interface State {
  players: Array<{id: string, name: string}>
  currentPlayerIndex: number | null
  currentPlayer: Player | null
  worldWidth: number
  worldHeight: number
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

    this.store = new Store(gameReducer, {
      players: [],
      currentPlayerIndex: null,
      currentPlayer: null,
      tiles,
      units: [],
      worldWidth,
      worldHeight
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

  // TODO: fix it
  unitsOf(player: Player) {
    return this.getState().units
  }
}
