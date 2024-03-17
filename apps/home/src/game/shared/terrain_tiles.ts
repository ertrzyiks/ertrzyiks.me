import type { PointLike } from "honeycomb-grid";

export class TerrainTiles<T> {
  protected objects: { [x: number]: { [y: number]: T } } = {};

  get(point: PointLike) {
    if (!this.objects[point.x]) {
      return null;
    }
    return this.objects[point.x][point.y];
  }

  set(point: PointLike, object: T) {
    this.objects[point.x] = this.objects[point.x] || {};
    this.objects[point.x][point.y] = object;
  }

  keys() {
    const points = [];

    for (let x in this.objects) {
      for (let y in this.objects[x]) {
        points.push({ x: parseInt(x), y: parseInt(y) });
      }
    }

    return points;
  }

  allValues() {
    return this.keys().map((point) => this.get(point));
  }

  clear() {
    this.objects = {};
  }
}
