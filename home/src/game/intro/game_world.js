import {GameWorld} from '../shared/game_world'
import {Ship} from '../shared/renderable/ship'
import TWEEN from '@tweenjs/tween.js'
import {GridSpreadAnimation} from '../shared/spread_animation'

export class IntroGridSpreadAnimation extends GridSpreadAnimation {
  constructor({Grid, grid, startCube}) {
    const from = {alpha: 0}
    const to = {alpha: 1}
    const duration = 80
    super({Grid, grid, startCube, from, to, duration})
  }
}

export class IntroWorld extends GameWorld {
  constructor (options) {
    super(options)

    this.currentAnimation = null

    this.ship = new Ship(this.resources.ship.texture)
    this.ship.scale.x = -1
  }

  createWorldTile(hex) {
    const sprite = super.createWorldTile(hex)
    sprite.alpha = 0
    return sprite
  }

  setup(point) {
    const tile = this.interaction.hitTest(point, this.viewport)

    if (tile) {
      const coords = tile.hexCoordinates()

      this.currentAnimation = this.animateFrom(tile, coords).start().onComplete(() => {
        this.putShipAt(coords)
        this.viewport.addChild(this.ship)
      })

      this.teardown()
    }
  }

  teardown() {
    this.viewport.once('clicked', e => {
      if (this.currentAnimation) {
        this.currentAnimation.stop()
      }

      this.fadeOut().start()
    })
  }

  fadeOut() {
    let state = { alpha: 1}
    return new TWEEN.Tween(state).to({ alpha: 0 }, 100).onUpdate(() => {
      this.ship.alpha = state.alpha

      this.grid.forEach(hex => {
        if (state.alpha < hex.sprite.alpha) {
          hex.sprite.alpha = state.alpha
        }
      })
    }).onComplete(() => {
      this.emitter.emit('exit')
    })
  }

  animateFrom(tile, coords) {
    const {Grid} = this.grid

    return new IntroGridSpreadAnimation({
      Grid,
      grid: this.grid,
      startCube: Grid.Hex(coords).cube()
    })
  }

  putShipAt(coords) {
    const shipPos = this.getTilePosition(coords)
    this.ship.x = shipPos.x
    this.ship.y = shipPos.y
    this.ship.updateCoordinates(coords)

    this.tweenShipToSomeNeighbour()
  }

  tweenShipToSomeNeighbour() {
    const directions = ['n', 'ne', 'se', 's', 'sw', 'nw']
    const direction = directions[Math.floor(Math.random() * directions.length)]
    return this.tweenToNeighbour(this.ship, direction).then(() => this.tweenShipToSomeNeighbour())
  }
}
