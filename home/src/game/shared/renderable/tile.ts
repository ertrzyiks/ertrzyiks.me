import {Polygon, Texture} from 'pixi.js'
import {Tileable} from './tileable'
import {cartesianToCube} from '../../core/grid'
import {CubeCoordinates} from 'honeycomb-grid'

export class Tile extends Tileable {
  constructor(texture: Texture, public coordinates: CubeCoordinates) {
    super(texture, coordinates)

    this.anchor.x = 0.5
    this.anchor.y = 0.5

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
