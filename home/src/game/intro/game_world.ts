import {GameWorld} from '../shared/game_world'
import {Ship} from '../shared/renderable/ship'
import {Tileable} from '../shared/renderable/tileable'
import * as TWEEN from '@tweenjs/tween.js'
import {Point} from 'pixi.js'
import {GridSpreadAnimation} from './spreading_animation'
import {Grid, Hex, CubeCoordinates, PointCoordinates, FlatCompassDirection} from 'honeycomb-grid'

function createSpreadAnimation(grid: Grid, startCube: CubeCoordinates) {
  return new GridSpreadAnimation({
    grid: grid,
    startCube: startCube,
    hexToElement: (hex) => hex.sprite,
    duration: 80
  })
}

export class IntroWorld extends GameWorld {
  private ship: Ship
  private currentAnimation: GridSpreadAnimation = null

  createWorldTile(hex: Hex<object>) {
    const sprite = super.createWorldTile(hex)
    sprite.alpha = 0
    return sprite
  }

  setup(point: Point) {
    const tile = this.interaction.hitTest(point, this.viewport)

    if (tile instanceof Tileable) {
      const coords = tile.hexCoordinates()

      this.currentAnimation = this.animateFrom(coords).start().onComplete(() => {
        this.putShipAt(coords)
        this.viewport.addChild(this.ship)
      })

      this.teardown()
    }
  }

  teardown() {
    this.viewport.once('clicked', () => {
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

      this.grid.forEach((hex: Hex<any>) => {
        if (state.alpha < hex.sprite.alpha) {
          hex.sprite.alpha = state.alpha
        }
      })
    }).onComplete(() => {
      this.emitter.emit('exit')
    })
  }

  animateFrom(coords: PointCoordinates) {
    return createSpreadAnimation(this.grid, this.grid.get(coords).cube())
  }

  putShipAt(coords: PointCoordinates) {
    const shipPos = this.getTilePosition(coords)
    this.ship = new Ship(this.resources.ship.texture, coords)
    this.ship.scale.x = -1
    this.ship.x = shipPos.x
    this.ship.y = shipPos.y

    this.tweenShipToSomeNeighbour()
  }

  tweenShipToSomeNeighbour(): Promise<void> {
    const directions = [0, 1, 2, 3, 4, 5]
    const direction = directions[Math.floor(Math.random() * directions.length)]
    return this.tweenToNeighbour(this.ship, direction).then(() => this.tweenShipToSomeNeighbour())
  }
}
