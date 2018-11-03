import * as image from '../../assets/sprites/editor.png'
import data from '../../assets/sprites/editor.json'
import {loaders, Spritesheet} from 'pixi.js'

export function preload(loader: loaders.Loader) {
  return new Promise(resolve => {
    loader.add('editor', image)

    loader.load((loader: loaders.Loader, resources: loaders.ResourceDictionary) => {
      const sheet = new Spritesheet(resources.intro.texture.baseTexture, data)

      sheet.parse(() => {
        resolve(resources)
      })
    })
  })
}
