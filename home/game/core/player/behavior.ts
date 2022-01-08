import {PlayerAction} from '../player_action'
import {State} from '../world'
import {GameEvent} from '../game_event'
import {StoreProxy} from '../store'

export class Behavior {
  protected store: StoreProxy<GameEvent, State, PlayerAction>

  constructor(store: StoreProxy<GameEvent, State, PlayerAction>) {
    this.store = store
  }

  takeActions() {
    throw new Error('not implemented')
  }
}
