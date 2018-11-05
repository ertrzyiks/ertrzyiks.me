import * as image0 from '../../assets/sprites/editor-0.png'
import data0 from '../../assets/sprites/editor-0.json'
import * as image1 from '../../assets/sprites/editor-1.png'
import data1 from '../../assets/sprites/editor-1.json'
import * as image2 from '../../assets/sprites/editor-2.png'
import data2 from '../../assets/sprites/editor-2.json'
import {loaders, Spritesheet} from 'pixi.js'

export function preload(loader: loaders.Loader) {
  const images = [image0, image1, image2]
  const data = [data0, data1, data2]

  return new Promise(resolve => {
    images.forEach((image, index) => {
      loader.add(`editor${index}`, image)
    })

    loader.load((loader: loaders.Loader, resources: loaders.ResourceDictionary) => {
      const sheets = data.map((atlasData, index) => {
        return new Spritesheet(resources[`editor${index}`].texture.baseTexture, atlasData)
      })

      Promise.all(sheets.map(sheet => parse(sheet))).then(resolve)
    })
  })
}

function parse(sheet: Spritesheet) {
  return new Promise(resolve => {
    sheet.parse(resolve)
  })
}
