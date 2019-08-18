import {CubeCoordinates} from 'honeycomb-grid'
import {Unit} from './units'
import {Player, Explorer} from './player'
import {Board} from './board'
import {World, WorldUpdateCallback} from './world'
import {PlayerAction, PlayerActionType} from './player_action'
import {GameEvent, GameEventType} from './game_event'
import {createGrid, positionAt} from './grid'
import {proxyStore} from "./store";

export enum GamePhase {
  Setup = 'setup',
  Turn = 'turn',
  Idle = 'idle'
}

export class Game {
  public players: Array<Player> = []
  public world: World
  public state: GamePhase = GamePhase.Setup

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

    this.update({
      type: GameEventType.Spawn,
      owner: player,
      unit: unit,
      position: position
    })
  }

  proceed() {
    this.allowedIn(GamePhase.Setup, GamePhase.Idle)

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
          position: positionAt(this.getUnitPosition(action.unit), action.direction)
        })
        break;

      case PlayerActionType.Attack:
        break;
    }

  }

  onUpdate(fn: WorldUpdateCallback) {
    this.world.subscribe(fn)
  }

  getUnitPosition(unit: Unit) {
    const u = this.world.getState().units.filter(u => u.unit == unit)

    return u[0].position
  }

  protected allowedIn(...states: Array<GamePhase>) {
    if (states.indexOf(this.state) == -1) {
      throw new Error(`This method can not be called in the '${this.state}' state`)
    }
  }

  protected startTurn() {
    this.state = GamePhase.Turn

    this.update({type: GameEventType.TurnStart})

    const proxy = proxyStore(this.world.store, {
      proxyAction: (action: PlayerAction, dispatch) => {
        switch(action.type) {
          case PlayerActionType.EndTurn:
            this.state = GamePhase.Idle
            dispatch({type: GameEventType.TurnEnd})
            break

          case PlayerActionType.Move:
            dispatch({
              type: GameEventType.Move,
              unit: action.unit,
              position: positionAt(this.getUnitPosition(action.unit), action.direction)
            })
            break
        }
      },
      proxyState: (s) => s
    })

    const explorer = new Explorer(proxy)
    explorer.takeActions()
  }

  protected endTurn() {
    this.state = GamePhase.Idle
    this.update({type: GameEventType.TurnEnd})

    if (this.endOfGame()) {
      this.update({type: GameEventType.GameEnd})
      return
    }
  }

  protected endOfGame() {
    return false
  }

  protected update(event: GameEvent) {
    this.world.dispatch(event)
  }
}
