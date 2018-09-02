import {Tileable} from './tileable'
import {Texture} from 'pixi.js'
import {PointCoordinates} from 'honeycomb-grid/dist/honeycomb.d.ts'

export class Ship extends Tileable {
  constructor(texture: Texture, coordinates: PointCoordinates) {
    super(texture, coordinates)
  }
}
