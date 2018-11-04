import * as image0 from '../../assets/sprites/editor-0.png'
import data0 from '../../assets/sprites/editor-0.json'
import * as image1 from '../../assets/sprites/editor-1.png'
import data1 from '../../assets/sprites/editor-1.json'
import * as image2 from '../../assets/sprites/editor-2.png'
import data2 from '../../assets/sprites/editor-2.json'
import {loaders, Spritesheet} from 'pixi.js'

export function preload(loader: loaders.Loader) {
  return new Promise(resolve => {
    loader.add('editor0', image0)
    loader.add('editor1', image1)
    loader.add('editor2', image2)

    loader.load((loader: loaders.Loader, resources: loaders.ResourceDictionary) => {
      const sheet0 = new Spritesheet(resources.editor0.texture.baseTexture, data0)
      const sheet1 = new Spritesheet(resources.editor1.texture.baseTexture, data1)
      const sheet2 = new Spritesheet(resources.editor2.texture.baseTexture, data2)

      sheet0.parse(() => {
        sheet1.parse(() => {
          sheet2.parse(() => {
            resolve(resources)
          })
        })
      })
    })
  })
}
