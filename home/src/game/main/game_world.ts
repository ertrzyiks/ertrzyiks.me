import {GameWorld} from '../shared/game_world'
import {interaction, loaders, ticker} from 'pixi.js'
import {
  Board,
  Player,
} from '../core'
import {Scenario} from './scenario'

export class MainWorld extends GameWorld {
  protected player: Player

  protected scenario: Scenario

  constructor (protected board: Board, protected resources: loaders.ResourceDictionary, protected ticker: ticker.Ticker, protected interaction: interaction.InteractionManager) {
    super(board, resources, ticker, interaction)

    this.scenario = new Scenario(this.game)

    this.scenario.start()
  }
}
