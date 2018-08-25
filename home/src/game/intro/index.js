import {BaseTexture} from 'pixi.js'
import {IntroWorld} from './game_world'
import {createGrid} from '../shared/grid'

function load(loader) {
  return new Promise(resolve => {
    loader.add('plain_tile', require('../../assets/intro/plain-tile.png'))
    loader.add('ship', require('../../assets/intro/single-ship.png'))

    loader.load((loader, resources) => {
      resolve(resources)
    })
  })
}

export function create(app, startingPoint, emitter) {
  const interaction = app.renderer.plugins.interaction
  const Grid = createGrid()
  const grid = Grid.rectangle({width: 30, height: 30})
  grid.Grid = Grid

  return load(app.loader).then(resources => {
    const world = new IntroWorld({
      grid,
      resources,
      emitter,
      ticker: app.ticker,
      interaction: interaction
    })

    setTimeout(() => {
      world.setup(startingPoint)
    }, 100)

    return world
  })
}
