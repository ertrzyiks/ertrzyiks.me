import {Application, Point, utils, loaders} from 'pixi.js'
import {IntroWorld} from './game_world'
import {createGrid} from '../shared/grid'
import * as plainTilePng from '../../assets/intro/plain-tile.png'
import * as singleShipPng from '../../assets/intro/single-ship.png'

function load(loader: loaders.Loader) {
  return new Promise(resolve => {
    loader.add('plain_tile', plainTilePng)
    loader.add('ship', singleShipPng)

    loader.load((loader: loaders.Loader, resources: loaders.ResourceDictionary) => {
      resolve(resources)
    })
  })
}

export function create(app: Application, startingPoint: Point, emitter: utils.EventEmitter) {
  const interaction = app.renderer.plugins.interaction
  const Grid = createGrid()
  const grid = Grid.rectangle({width: 30, height: 30})

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
