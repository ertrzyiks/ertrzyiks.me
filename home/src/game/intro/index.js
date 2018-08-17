import Loader from 'pixi.js/lib/loaders/loader'
import InteractionManager from 'pixi.js/lib/interaction/InteractionManager'
import TWEEN from '@tweenjs/tween.js'
import {GameViewport} from '../shared/viewport'
import {Tile} from '../shared/renderable/tile.js'
import {createGrid, getGridBoundingBox} from '../shared/grid'
import {GridSpreadAnimation} from '../shared/spread_animation'

class IntroGridSpreadAnimation extends GridSpreadAnimation {
  constructor({Grid, grid, startCube}) {
    const from = {alpha: 0}
    const to = {alpha: 1}
    const duration = 80
    super({Grid, grid, startCube, from, to, duration})
  }
}

function load() {
  return new Promise(resolve => {
    const loader = new Loader()

    loader.add('plain_tile', require('../../assets/intro/plain-tile.png'))

    loader.load((loader, resources) => {
      resolve(resources)
    })
  })
}

export function create(app, startingPoint, emitter) {
  const interaction = new InteractionManager(app.renderer)
  const Grid = createGrid()
  const grid = Grid.rectangle({width: 30, height: 30})
  grid.Grid = Grid

  const {worldWidth, worldHeight} = getGridBoundingBox(grid)

  var viewport = new GameViewport({
    worldWidth: worldWidth,
    worldHeight: worldHeight,
    ticker: app.ticker
  })

  return load().then(resources => {
    grid.forEach(hex => {
      const {x, y} = hex.toPoint()
      const sprite = new Tile(resources.plain_tile.texture, hex.coordinates())

      sprite.position.set(x, y)
      sprite.alpha = 0
      sprite.interactive = true
      sprite.buttonMode = false

      hex.sprite = sprite

      viewport.addChild(sprite)
    })

    function fadeOut() {
      let state = { alpha: 1}
      return new TWEEN.Tween(state).to({ alpha: 0 }, 100).onUpdate(() => {
        grid.forEach(hex => {
          if (state.alpha < hex.sprite.alpha) {
            hex.sprite.alpha = state.alpha
          }
        })
      })
    }

    function animateFrom(tile, coords) {
      return new IntroGridSpreadAnimation({
        Grid,
        grid,
        startCube: Grid.Hex(coords).cube()
      })
    }

    let currentAnimation

    viewport.on('clicked', function onClick(e) {
      console.log(e.screen)
    })

    function setup(point) {
      const tile = interaction.hitTest(point, viewport)

      console.log('TILE', tile)

      if (tile) {
        const coords = tile.hexCoordinates()

        currentAnimation = animateFrom(tile, coords).start()
        teardown()
      }
    }

    function teardown() {
      viewport.once('clicked', function onClick(e) {
        if (currentAnimation) {
          currentAnimation.stop()
        }
        fadeOut().start()
      })
    }

    setTimeout(() => {
      setup(startingPoint)

    }, 100)

    return viewport
  })
}
