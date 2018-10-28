import {PointLike} from 'honeycomb-grid'
import {DisplayObject} from 'pixi.js'

export class TerrainTiles {
  protected objects: {[x: number]: {[y: number]: DisplayObject}} = {}

  get(point: PointLike) {
    if (!this.objects[point.x]) { return null }
    return this.objects[point.x][point.y]
  }

  set(point: PointLike, object: DisplayObject) {
    this.objects[point.x] = this.objects[point.x] || {}
    this.objects[point.x][point.y] = object
  }

  keys() {
    const points = []

    for (let x in this.objects) {
      for (let y in this.objects[x]) {
        points.push({x: parseInt(x), y: parseInt(y)})
      }
    }

    return points
  }
}
