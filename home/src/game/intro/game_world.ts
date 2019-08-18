import {GameWorld} from '../shared/game_world'
import {Tileable} from '../shared/renderable/tileable'
import * as TWEEN from '@tweenjs/tween.js'
import {interaction, loaders, Point, ticker, utils} from 'pixi.js'
import {GridSpreadAnimation} from './grid/spreading_animation'
import {CubeCoordinates} from 'honeycomb-grid'
import {cartesianToCube, GameTileHex, Board, Player, PlayerColor, Movable, Unit} from '../core'
import {Ship} from './units'

export class IntroWorld extends GameWorld {
  public emitter: utils.EventEmitter

  protected currentAnimation: GridSpreadAnimation = null
  protected player: Player

  constructor (protected board: Board, protected resources: loaders.ResourceDictionary, protected ticker: ticker.Ticker, protected interaction: interaction.InteractionManager) {
    super(board, resources, ticker, interaction)
    this.player = {
      id: 'cpu',
      name: 'ship',
      color: PlayerColor.RED
    }
    this.emitter = new utils.EventEmitter()
  }

  setup(point: Point) {
    const tile = this.interaction.hitTest(point, this.viewport)

    if (tile instanceof Tileable) {
      const coords = tile.coordinates

      this.currentAnimation = this.animateFrom(coords).start().onComplete(() => {
        const ship = new Ship()
        ship.textureName = 'ship'

        this.game.add(this.player)
        this.game.spawn(this.player, new Ship(), coords)
        this.game.proceed()
      })

      this.teardown()
    }
  }

  teardown () {
    this.viewport.once('clicked', () => {
      if (this.currentAnimation) {
        this.currentAnimation.stop()
      }

      this.fadeOut().start()
    })
  }

  protected createWorldTile(hex: GameTileHex) {
    const sprite = super.createWorldTile(hex)
    sprite.alpha = 0
    return sprite
  }

  private fadeOut() {
    let state = { alpha: 1}
    return new TWEEN.Tween(state).to({ alpha: 0 }, 100).onUpdate(() => {
      this.alpha = state.alpha
    }).onComplete(() => {
      this.emitter.emit('exit')
    })
  }

  private animateFrom(coords: CubeCoordinates) {
    return new GridSpreadAnimation({
      startCube: coords,
      terrainTiles: this.terrainTiles,
      duration: 80
    })
  }
}
