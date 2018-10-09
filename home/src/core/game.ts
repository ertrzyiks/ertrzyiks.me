import {CubeCoordinates} from 'honeycomb-grid'
import {Unit} from './unit/unit'
import {Player} from './player'
import {Board} from './board'
import {Controller} from './controller'
import {World} from './world'
import {PlayerAction, PlayerActionType} from './player_action'
import {WorldState} from './world'
import {GameEvent, GameEventType} from './game_event'
import {createGrid, positionAt} from './grid'

export type WorldUpdateCallback = (state: WorldState) => void

export enum GamePhase {
  Setup = 'setup',
  Turn = 'turn',
  Idle = 'idle'
}

export class Game {
  public players: Array<Player> = []
  public world: World
  public currentPlayer: Player | null
  public state: GamePhase = GamePhase.Setup

  protected updateCallbacks: Array<WorldUpdateCallback> = []

  constructor(protected board: Board) {
    const grid = createGrid(board)
    this.world = new World(grid)
  }

  add(player: Player) {
    this.allowedIn(GamePhase.Setup)

    this.players.push(player)
    this.update({
      type: GameEventType.PlayerJoin,
      player: player
    })
  }

  spawn(player: Player, unit: Unit, position: CubeCoordinates) {
    this.allowedIn(GamePhase.Setup, GamePhase.Idle)

    player.units.push(unit)

    this.update({
      type: GameEventType.Spawn,
      owner: player,
      unit: unit,
      position: position
    })
  }

  proceed() {
    this.allowedIn(GamePhase.Setup, GamePhase.Idle)

    this.assignNextPlayer()
    this.startTurn()
  }

  do(action: PlayerAction) {
    this.allowedIn(GamePhase.Turn)

    switch(action.type) {
      case PlayerActionType.EndTurn:
        this.endTurn()
        break;

      case PlayerActionType.UndoLast:
        break;

      case PlayerActionType.ResetTurn:
        break;

      case PlayerActionType.Move:
        this.update({
          type: GameEventType.Move,
          unit: action.unit,
          position: positionAt(this.getUnitPosition(action.unit), action.direction),
          player: this.currentPlayer
        })
        break;

      case PlayerActionType.Attack:
        break;
    }

  }

  onUpdate(fn: WorldUpdateCallback) {
    this.updateCallbacks.push(fn)
  }

  getUnitPosition(unit: Unit) {
    const u = this.world.currentState.boardState.units.filter(u => u.unit == unit)

    return u[0].position
  }

  protected allowedIn(...states: Array<GamePhase>) {
    if (states.indexOf(this.state) == -1) {
      throw new Error(`This method can not be called in the '${this.state}' state`)
    }
  }

  protected startTurn() {
    this.state = GamePhase.Turn

    this.world.unitsOf(this.currentPlayer).forEach(u => u.unit.replenish())

    this.update({type: GameEventType.TurnStart, player: this.currentPlayer})

    const controller = new Controller(this, this.currentPlayer)
    this.currentPlayer.takeActions(controller)
  }

  protected endTurn() {
    this.state = GamePhase.Idle
    this.update({type: GameEventType.TurnEnd, player: this.currentPlayer})

    if (this.endOfGame()) {
      this.update({type: GameEventType.GameEnd})
      return
    }
  }

  protected endOfGame() {
    return false
  }

  protected update(event: GameEvent) {
    this.world.update(event)

    this.updateCallbacks.forEach(fn => {
      fn(this.world.currentState)
    })
  }

  protected assignNextPlayer() {
    const currentIndex = this.players.indexOf(this.currentPlayer)
    const nextIndex = (currentIndex + 1) % this.players.length
    this.currentPlayer = this.players[nextIndex]
  }
}
