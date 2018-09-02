import {Polygon, Texture} from 'pixi.js'
import {Tileable} from './tileable'
import {PointCoordinates} from 'honeycomb-grid/dist/honeycomb.d.ts'

export class Tile extends Tileable {
  constructor(texture: Texture, coordinates: PointCoordinates) {
    super(texture, coordinates)

    const size = this.width / 2
    const points = []

    const x = this.width / 2
    const y = this.height / 2

    for (let side = 0; side < 7; side++) {
      points.push(x + size * Math.cos(side * 2 * Math.PI / 6), y + size * Math.sin(side * 2 * Math.PI / 6))
    }

    this.hitArea = new Polygon(points)
  }
}
