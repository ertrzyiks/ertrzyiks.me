import {Container, loaders, ticker, interaction, utils, DestroyOptions, DisplayObject, Sprite} from 'pixi.js'
import {GameViewport} from './viewport'
import {getGridBoundingBox} from './grid'
import {Tile} from './renderable/tile'
import {Tileable} from './renderable/tileable'
import * as TWEEN from '@tweenjs/tween.js'
import {CompassDirection, Grid, Hex, PointCoordinates} from 'honeycomb-grid'

export class GameWorld extends Container {
  protected viewport: GameViewport
  protected currentTween: TWEEN.Tween
  protected tickerFunction = () => this.cull()

  constructor (protected grid: Grid, protected emitter: utils.EventEmitter, protected resources: loaders.ResourceDictionary, protected ticker: ticker.Ticker, protected interaction: interaction.InteractionManager) {
    super()
    const {worldWidth, worldHeight} = getGridBoundingBox(grid)

    this.viewport = new GameViewport({
      worldWidth,
      worldHeight,
      ticker,
      interaction
    })

    ticker.add(this.tickerFunction)

    this.grid.forEach((hex: Hex<{sprite: DisplayObject}>) => {
      const sprite = this.createWorldTile(hex)
      hex.sprite = sprite
      this.viewport.addChild(sprite)
    })

    this.addChild(this.viewport)
  }

  createWorldTile(hex: Hex<Object>) {
    const {x, y} = hex.toPoint()
    const sprite = new Tile(this.resources.plain_tile.texture, hex.coordinates())

    sprite.position.set(x, y)
    sprite.interactive = true
    sprite.buttonMode = false

    return sprite
  }

  getTilePosition(query: number | PointCoordinates) {
    return this.grid.get(query).toPoint()
  }

  tweenToNeighbour(tileable: Tileable, direction: CompassDirection) {
    const coordinates = tileable.hexCoordinates()
    const newCoordinates = this.grid.neighborsOf(this.grid.get(coordinates), direction)[0]
    const newPos = this.grid.get(newCoordinates).toPoint()

    return new Promise(resolve => {
      this.currentTween = new TWEEN.Tween(tileable).to(newPos, 1000).delay(300).onComplete(() => {
        tileable.coordinates = newCoordinates
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

      if (!(child instanceof Sprite)) continue

      child.visible = child.x >= left &&
                      child.y >= top &&
                      (child.x + child.width) <= right &&
                      (child.y + child.height) <= bottom
    }
  }

  destroy(options?: DestroyOptions | boolean) {
    this.currentTween.stop()
    this.ticker.remove(this.tickerFunction)
    super.destroy(options)
  }
}
