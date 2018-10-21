import {Application, Point, utils, loaders} from 'pixi.js'
import {IntroWorld} from './game_world'
import {Board} from '../core'
import * as plainTilePng from '../../assets/intro/plain-tile.png'
import * as singleShipPng from '../../assets/intro/single-ship.png'
import board from './board.json'

function load(loader: loaders.Loader) {
  return new Promise(resolve => {
    loader.add('water', plainTilePng)
    loader.add('ship', singleShipPng)

    loader.load((loader: loaders.Loader, resources: loaders.ResourceDictionary) => {
      resolve(resources)
    })
  })
}

export function create(app: Application, startingPoint: Point) {
  const interaction = app.renderer.plugins.interaction

  return load(app.loader).then((resources: loaders.ResourceDictionary) => {
    const world = new IntroWorld(
      board,
      resources,
      app.ticker,
      interaction
    )

    setTimeout(() => {
      world.setup(startingPoint)
    }, 100)

    return world
  })
}
