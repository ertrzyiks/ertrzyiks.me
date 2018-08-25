import {Container} from 'pixi.js'
import {GameViewport} from './viewport'
import {getGridBoundingBox} from './grid'
import {Tile} from './renderable/tile'
import TWEEN from '@tweenjs/tween.js'

export class GameWorld extends Container {
  constructor ({grid, emitter, resources, ticker, interaction}) {
    super({grid, emitter, resources, ticker, interaction})
    const {worldWidth, worldHeight} = getGridBoundingBox(grid)

    this.grid = grid
    this.ticker = ticker
    this.Grid = grid.Grid
    this.Hex = grid.Grid.Hex
    this.emitter = emitter
    this.resources = resources
    this.interaction = interaction
    this.currentTween = null
    this.viewport = new GameViewport({
      worldWidth,
      worldHeight,
      ticker,
      interaction
    })

    this.tickerFunction = () => this.cull()
    ticker.add(this.tickerFunction)

    this.grid.forEach(hex => {
      const sprite = this.createWorldTile(hex)
      hex.sprite = sprite
      this.viewport.addChild(sprite)
    })

    this.addChild(this.viewport)
  }

  createWorldTile(hex) {
    const {x, y} = hex.toPoint()
    const sprite = new Tile(this.resources.plain_tile.texture, hex.coordinates())

    sprite.position.set(x, y)
    sprite.interactive = true
    sprite.buttonMode = false

    return sprite
  }

  getTilePosition(query) {
    return this.grid.get(query).toPoint()
  }

  tweenToNeighbour(tileable, direction) {
    const coordinates = tileable.hexCoordinates()
    const newCoordinates = this.grid.neighborsOf(this.Hex(coordinates), direction)[0]
    const newPos = this.grid.get(newCoordinates).toPoint()

    return new Promise(resolve => {
      this.currentTween = new TWEEN.Tween(tileable).to(newPos, 1000).delay(300).onComplete(() => {
        tileable.updateCoordinates(newCoordinates)
        resolve()
      })

      this.currentTween.start()
    })
  }

  cull() {
    const viewport = this.viewport
    const corner = viewport.corner
    const length = viewport.children.length
    const margin = 150

    const left = corner.x - margin
    const top = corner.y - margin
    const right = corner.x + viewport.screenWidth + margin
    const bottom = corner.y + viewport.screenHeight + margin

    for (let i = 0; i < length; i++) {
      const child = this.viewport.children[i]
      child.visible = child.x >= left &&
                      child.y >= top &&
                      (child.x + child.width) <= right &&
                      (child.y + child.height) <= bottom
    }
  }

  destroy(options) {
    this.currentTween.stop()
    this.ticker.remove(this.tickerFunction)
    super.destroy(options)
  }
}
