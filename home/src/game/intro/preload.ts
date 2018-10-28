import * as image from '../../assets/sprites/intro.png'
import data from '../../assets/sprites/intro.json'
import {loaders, Spritesheet} from 'pixi.js'

export function preload(loader: loaders.Loader) {
  return new Promise(resolve => {
    loader.add('intro', image)

    loader.load((loader: loaders.Loader, resources: loaders.ResourceDictionary) => {
      const sheet = new Spritesheet(resources.intro.texture.baseTexture, data)

      sheet.parse(() => {
        resolve(resources)
      })
    })
  })
}
