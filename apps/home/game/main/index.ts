import {Application, loaders} from 'pixi.js'

import board from './boards/board1.json'
import {preload} from './preload'
import {MainWorld} from "./game_world";

export function create(app: Application) {
  const interaction = app.renderer.plugins.interaction

  return preload(app.loader).then((resources: loaders.ResourceDictionary) => {
    const world = new MainWorld(
      board,
      resources,
      app.ticker,
      interaction
    )

    return world
  })
}
