import {Loader} from 'pixi.js'
import {GameViewport} from '../shared/viewport'
import {Tile} from '../shared/renderable/tile.js'
import {createGrid, getGridBoundingBox} from '../shared/grid'

function getCoordinatesToIndex({gridWidth}) {
  return function coordinatesToIndex({x, y}) {
    return x * gridWidth + y
  }
}

export function create(app, emitter, coordinates) {
  const interaction = app.renderer.plugins.interaction
  const Grid = createGrid()
  const grid = Grid.rectangle({width: 30, height: 30})
  const coordinatesToIndex = getCoordinatesToIndex({gridWidth: 30})
  const hexes = []

  const {worldWidth, worldHeight} = getGridBoundingBox(grid)

  var viewport = new GameViewport({
    worldWidth: worldWidth,
    worldHeight: worldHeight,
    ticker: app.ticker
  })

  return new Promise(resolve => {
    const loader = new Loader()

    loader.load((loader, resources) => {
      const marker = new Tile(resources.marker.texture)
      marker.visible = false

      // Opt-in to interactivity
      marker.interactive = true
      marker.buttonMode = true

      grid.forEach(hex => {
        const {x, y} = hex.toPoint()
        const sprite = new Tile(resources.tile.texture)

        hexes.push(sprite)

        // Set the initial position
        sprite.position.set(x, y)

        sprite.alpha = 0.5

        // Opt-in to interactivity
        sprite.interactive = true

        // Shows hand cursor
        sprite.buttonMode = true

        viewport.addChild(sprite)
      })
      const index = coordinatesToIndex(coordinates)
      hexes[index].alpha = 1

      grid.neighborsOf(Grid.Hex(coordinates.x, coordinates.y), 'all').forEach(hex => {
        hexes[coordinatesToIndex(hex)].alpha = 1
      })

      grid.neighborsOf(Grid.Hex(coordinates.x, coordinates.y), 'all', true).forEach(hex => {
        hexes[coordinatesToIndex(hex)].alpha = 1
      })

      viewport.addChild(marker)
      viewport.on('clicked', onClick)

      function onClick(e) {
        const target = interaction.hitTest(e.screen, viewport)

        if (marker.visible && target === marker) {
          marker.visible = false
          return
        }
        marker.visible = true
        marker.position.set(target.x - 1 , target.y)
      }
    })

    resolve(viewport)
  })
}
