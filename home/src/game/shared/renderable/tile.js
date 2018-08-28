import {Polygon} from 'pixi.js'
import {Tileable} from './tileable'

export class Tile extends Tileable {
  constructor(...args) {
    super(...args)

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
