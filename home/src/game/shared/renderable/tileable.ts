import {Sprite, Texture} from 'pixi.js'
import {PointCoordinates} from 'honeycomb-grid'

export class Tileable extends Sprite {
  private coordinates: PointCoordinates

  constructor(texture: Texture, coordinates: PointCoordinates) {
    super(texture)
    this.coordinates = coordinates
    this.anchor.x = 0.5
    this.anchor.y = 0.5
  }

  hexCoordinates() {
    return this.coordinates
  }
}
