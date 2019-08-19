import {CubeCoordinates} from 'honeycomb-grid'
import {Unit} from './units'
import {Player, Explorer} from './player'
import {Board} from './board'
import {World, State} from './world'
import {GameEvent, GameEventType} from './game_event'
import {createGrid, positionAt} from './grid'
import {Observable} from '../shared/observable'

interface WorldUpdateTuple {
  action: GameEvent
  state: State
}

export class Game {
  public world: World
  public worldObservable: Observable<WorldUpdateTuple>

  constructor(protected board: Board) {
    const grid = createGrid(board)
    this.world = new World(grid)

    this.worldObservable = new Observable()
    this.world.subscribe(this.onWorldUpdate.bind(this))
  }

  add(player: Player) {
    this.dispatch({
      type: GameEventType.PlayerJoin,
      player: player
    })
  }

  spawn(player: Player, unit: Unit, position: CubeCoordinates) {
    this.dispatch({
      type: GameEventType.Spawn,
      owner: player,
      unit: unit,
      position: position
    })
  }

  nextTurn() {
    this.dispatch({type: GameEventType.StartTurn})
  }


  protected dispatch(event: GameEvent) {
    this.world.dispatch(event)
  }

  protected onWorldUpdate(state: State, action: GameEvent) {
    this.worldObservable.push({state, action})

    if (action.type === GameEventType.EndTurn) {
      this.worldObservable.onNextDrain(() => {
        this.nextTurn()
      })
    }
  }
}
