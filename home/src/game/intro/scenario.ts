import {Game} from '../core/game'
import {Player, PlayerColor} from '../core/player/player'
import {Ship} from './units'
import {CubeCoordinates} from 'honeycomb-grid'
import {ObservableSubscriptionDone} from '../shared/observable'
import {GameEvent, GameEventType} from '../core/game_event'
import {State} from '../core/world'
import {createPlayerStore} from '../core/player_store'
import {StoreProxy} from '../core/store'
import {PlayerAction} from '../core/player_action'
import {Explorer} from '../core/player/explorer'

export class Scenario {
  protected player: Player = {
    id: 'cpu',
    name: 'ship',
    color: PlayerColor.RED
  }

  constructor(protected game: Game) {
    game.worldObservable.subscribe(this.onWorldUpdate.bind(this))
  }

  protected onWorldUpdate({state, action}: {state: State, action: GameEvent}, done: ObservableSubscriptionDone) {
    switch (action.type) {
      case GameEventType.StartTurn:
        done()
        this.onTurnStart(state.currentPlayer, createPlayerStore(this.game.world.store, state.currentPlayer))
        break

      default:
        done()
        break
    }
  }

  public start(coords: CubeCoordinates) {
    this.game.add(this.player)
    this.game.spawn(this.player, new Ship(), coords)
    this.game.nextTurn()
  }

  protected onTurnStart(player: Player, store: StoreProxy<GameEvent, State, PlayerAction>) {
    const explorer = new Explorer(store)
    explorer.takeActions()
  }
}
