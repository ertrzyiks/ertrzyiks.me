import {Application, loaders} from 'pixi.js'
import {EditorWorld} from './game_world'
import {preload} from './preload'
import {Board} from '../core'

import board from './board.json'

export function create(app: Application) {
  const interaction = app.renderer.plugins.interaction

  return preload(app.loader).then((resources: loaders.ResourceDictionary) => {
    const world = new EditorWorld(
      board,
      resources,
      app.ticker,
      interaction
    )

    return world
  })
}
