import {PlayerAction, PlayerActionType} from './player_action'
import {Game, Player} from './index'
import {Unit} from "./unit/unit";

export class Controller {
  private active: boolean = true

  constructor(protected game: Game, protected activePlayer: Player) {}

  get boardState() { return this.game.world.currentState.boardState }

  getUnitPosition(unit: Unit) {
    return this.game.getUnitPosition(unit)
  }

  do(action: PlayerAction) {
    this.ensureWorldIsActive()

    if (action.type == PlayerActionType.EndTurn) {
      this.active = false
    }

    this.game.do(action)
  }

  private ensureWorldIsActive() {
    if (!this.active) {
      throw new Error('This world is not active anymore.')
    }
  }
}
