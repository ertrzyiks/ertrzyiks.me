import {Container, loaders, ticker, interaction, utils, DestroyOptions, DisplayObject, Sprite} from 'pixi.js'
import {GameViewport} from './viewport'
import {Tile} from './renderable/tile'
import * as TWEEN from '@tweenjs/tween.js'
import {Board, Game, GameTileHex, WorldState, GameEventType} from '../../core'
import {CubeCoordinates, PointLike} from 'honeycomb-grid'
import {cubeToCartesian} from '../../core/grid/helpers'

export class TerrainTiles {
  protected objects: {[x: number]: {[y: number]: DisplayObject}} = {}

  get(point: PointLike) {
    if (!this.objects[point.x]) { return null }
    return this.objects[point.x][point.y]
  }

  set(point: PointLike, object: DisplayObject) {
    this.objects[point.x] = this.objects[point.x] || {}
    this.objects[point.x][point.y] = object
  }

  keys() {
    const points = []

    for (let x in this.objects) {
      for (let y in this.objects[x]) {
        points.push({x: parseInt(x), y: parseInt(y)})
      }
    }

    return points
  }
}

type ObservableSubscriptionDone = () => void
type ObservableSubscription<T> = (item: T, done: ObservableSubscriptionDone) => void

class Observable<T> {
  protected items: Array<T> = []
  protected subscription: ObservableSubscription<T>
  protected isWaiting = false

  push(item: T) {
    this.items.push(item)
    this.publishNext()
  }

  subscribe(fn: ObservableSubscription<T>) {
    if (this.subscription != null) throw new Error('Already subscribed')
    this.subscription = fn
    this.publishNext()
  }

  protected publishNext() {
    if (this.items.length == 0) return
    if (this.subscription == null) return
    if (this.isWaiting) return

    this.isWaiting = true

    const item = this.items.shift()

    this.subscription(item, () => {
      this.isWaiting = false
      this.publishNext()
    })
  }
}

export class GameWorld extends Container {
  protected game: Game
  protected viewport: GameViewport
  protected currentTween: TWEEN.Tween
  protected tickerFunction = () => this.cull()
  protected terrainTiles: TerrainTiles = new TerrainTiles()
  protected worldObservable: Observable<WorldState>

  protected ship: Tile

  constructor (protected board: Board, protected resources: loaders.ResourceDictionary, protected ticker: ticker.Ticker, protected interaction: interaction.InteractionManager) {
    super()
    this.game = new Game(board)

    this.viewport = new GameViewport({
      worldWidth: this.game.world.width,
      worldHeight: this.game.world.height,
      ticker,
      interaction
    })

    ticker.add(this.tickerFunction)

    this.renderTerrain()
    this.observeWorldUpdates()

    this.addChild(this.viewport)
  }

  protected observeWorldUpdates() {
    this.worldObservable = new Observable()
    this.game.onUpdate(state => this.worldObservable.push(state))
    this.worldObservable.subscribe(this.onWorldUpdate.bind(this))
  }

  protected onWorldUpdate(state: WorldState, done: ObservableSubscriptionDone) {
    const event = state.lastEvent

    switch(event.type) {
      case GameEventType.TurnEnd:
        this.game.proceed()
        done()
        break

      case GameEventType.Spawn:
        const tile = this.getTerrainAt(event.position)
        this.ship = new Tile(this.resources.ship.texture, event.position)
        this.ship.scale.x = -1
        this.ship.x = tile.x
        this.ship.y = tile.y
        this.viewport.addChild(this.ship)
        done()
        break

      case GameEventType.Move:
        const tile1 = this.getTerrainAt(event.position)

        const tween = new TWEEN.Tween(this.ship).to({x: tile1.x, y: tile1.y}, 1000).delay(300).onComplete(() => {
          this.ship.coordinates = event.position
          done()
        })

        tween.start()
        break

      default:
        done()
        break
    }
  }

  protected createWorldTile(hex: GameTileHex) {
    const {x, y} = hex.toPoint()

    const coords = hex.cube()

    const sprite = new Tile(this.resources[hex.terrain].texture, coords)

    sprite.position.set(x, y)
    sprite.interactive = true
    sprite.buttonMode = false

    return sprite
  }

  protected renderTerrain() {
    this.game.world.currentState.boardState.terrain.forEach((hex: GameTileHex) => {
      const sprite = this.createWorldTile(hex)
      const coords = hex.coordinates()

      this.terrainTiles.set(coords, sprite)
      this.viewport.addChild(sprite)
    })
  }

  protected getTerrainAt(pos: CubeCoordinates) {
    const point = cubeToCartesian(pos)
    return this.terrainTiles.get(point)
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
