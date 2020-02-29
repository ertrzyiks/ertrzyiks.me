import {GameWorld} from '../shared/game_world'
import {interaction, loaders, ticker} from 'pixi.js'
import {
  Board,
  StoreProxy,
  GameEvent,
  Player,
  PlayerColor,
} from '../core'
import {State} from '../core/world'
import {PlayerAction} from '../core/player_action'

export class MainWorld extends GameWorld {
  protected player: Player

  constructor (protected board: Board, protected resources: loaders.ResourceDictionary, protected ticker: ticker.Ticker, protected interaction: interaction.InteractionManager) {
    super(board, resources, ticker, interaction)
    this.player = {
      id: 'cpu',
      name: 'ship',
      color: PlayerColor.RED
    }
  }

  onTurnStart(store: StoreProxy<GameEvent, State, PlayerAction>) {
    // const explorer = new Explorer(store)
    // explorer.takeActions()
  }

  // protected createWorldTile(hex: GameTileHex) {
  //   const sprite = super.createWorldTile(hex)
  //   sprite.alpha = 0
  //   return sprite
  // }
}
