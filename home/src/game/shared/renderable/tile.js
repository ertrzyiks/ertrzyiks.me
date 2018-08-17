import {Sprite, Polygon} from 'pixi.js'

export class Tile extends Sprite {
  constructor(texture, coordinates) {
    super(texture)
    this.coordinates = coordinates

    const size = this.width / 2
    const points = []

    const x = this.width / 2
    const y = this.height / 2

    for (let side = 0; side < 7; side++) {
      points.push(x + size * Math.cos(side * 2 * Math.PI / 6), y + size * Math.sin(side * 2 * Math.PI / 6))
    }

    this.hitArea = new Polygon(points)
  }

  hexCoordinates() {
    return this.coordinates
  }
}
