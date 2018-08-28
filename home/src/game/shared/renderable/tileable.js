import {Sprite} from 'pixi.js'

export class Tileable extends Sprite {
  constructor(texture, coordinates) {
    super(texture)
    this.coordinates = coordinates
    this.anchor = {x: 0.5, y: 0.5}
  }

  hexCoordinates() {
    return this.coordinates
  }

  updateCoordinates(coordinates) {
    this.coordinates = coordinates
  }
}
