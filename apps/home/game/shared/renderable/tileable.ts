import {Sprite, Texture} from 'pixi.js'
import {CubeCoordinates} from 'honeycomb-grid'

export class Tileable extends Sprite {
  constructor(texture: Texture, public coordinates: CubeCoordinates) {
    super(texture)
    this.anchor.x = 0.5
    this.anchor.y = 0.5
  }
}
