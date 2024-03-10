import * as image from '../../assets/sprites/board1-0.png'
import data from '../../assets/sprites/board1-0.json'
import {loaders, Spritesheet} from 'pixi.js'

export function preload(loader: loaders.Loader) {
  return new Promise(resolve => {
    loader.add('board1', image)

    loader.load((loader: loaders.Loader, resources: loaders.ResourceDictionary) => {
      const sheet = new Spritesheet(resources.board1.texture.baseTexture, data)

      sheet.parse(() => {
        resolve(resources)
      })
    })
  })
}
