import {Application, Point, loaders} from 'pixi.js'
import {IntroWorld} from './game_world'
import {preload} from './preload'

import board from './board.json'

export function create(app: Application, startingPoint: Point) {
  const interaction = app.renderer.plugins.interaction

  return preload(app.loader).then((resources: loaders.ResourceDictionary) => {
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
