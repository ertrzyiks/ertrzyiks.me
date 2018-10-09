import {GameWorld} from '../shared/game_world'
import {Renderable} from '../shared/renderable/renderable'
import {Tileable} from '../shared/renderable/tileable'
import * as TWEEN from '@tweenjs/tween.js'
import {interaction, loaders, Point, ticker} from 'pixi.js'
import {GridSpreadAnimation} from './spreading_animation'
import {CubeCoordinates} from 'honeycomb-grid'
import {cartesianToCube, GameTileHex, Board, CpuPlayer, PlayerColor, Movable, Unit} from '../../core'

export class IntroWorld extends GameWorld {
  private currentAnimation: GridSpreadAnimation = null
  private player: CpuPlayer

  constructor (protected board: Board, protected resources: loaders.ResourceDictionary, protected ticker: ticker.Ticker, protected interaction: interaction.InteractionManager) {
    super(board, resources, ticker, interaction)
    this.player = new CpuPlayer(PlayerColor.RED)
  }

  setup(point: Point) {
    const tile = this.interaction.hitTest(point, this.viewport)

    if (tile instanceof Tileable) {
      const coords = tile.coordinates

      this.currentAnimation = this.animateFrom(coords).start().onComplete(() => {
        const Ship = Renderable(Movable(Unit))
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
      // this.emitter.emit('exit')
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
