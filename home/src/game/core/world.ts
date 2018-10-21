import {Grid} from 'honeycomb-grid'
import {GameEvent, GameEventType} from './game_event'
import {BoardState} from './board_state'
import {getGridBoundingBox} from './grid'
import {Player} from './player'

export interface WorldState {
  boardState: BoardState,
  lastEvent: GameEvent
}

export class World {
  public states: Array<WorldState> = []
  get currentStateId() { return this.states.length - 1 }
  get currentState() { return this.states[this.currentStateId] }

  get width() { return this.worldWidth }
  get height() { return this.worldHeight }

  protected worldWidth: number
  protected worldHeight: number

  constructor(protected grid: Grid) {
    const terrain = grid.reduce((acc, hex) => {
      acc.push(hex)
      return acc
    }, [])

    const initialBoardsState = new BoardState(terrain)
    this.states.push({
      boardState: initialBoardsState,
      lastEvent: {type: GameEventType.GameStart}
    })

    const {worldWidth, worldHeight} = getGridBoundingBox(grid)
    this.worldWidth = worldWidth
    this.worldHeight = worldHeight
  }

  update(event: GameEvent) {
    this.states.push({
      boardState: this.applyEvent(this.currentState.boardState, event),
      lastEvent: event,
    })

    return this.currentStateId
  }

  resetTo(gameStateId: number) {
    this.states.push({
      boardState: this.states[gameStateId].boardState,
      lastEvent: {type: GameEventType.Reset}
    })

    return this.currentStateId
  }

  unitsOf(player: Player) {
    return this.currentState.boardState.units.filter(unitPos => player.owns(unitPos.unit))
  }

  protected applyEvent(boardState: BoardState, event: GameEvent) {
    switch (event.type) {
      case GameEventType.Move:
        return boardState.updateUnit(event.unit, event.position)
      case GameEventType.Spawn:
        return boardState.addUnit(event.unit, event.position)
    }
    return boardState
  }
}
