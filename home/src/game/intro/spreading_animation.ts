import RecursiveTween from '../../lib/recursive_tween'
import {Tween, Easing} from '@tweenjs/tween.js'
import {getNextSpreadingWave} from './grid'
import {cartesianToCube} from '../core/grid'
import {CubeCoordinates, PointLike} from 'honeycomb-grid'
import {TerrainTiles} from '../shared/terrain_tiles'

export interface GridSpreadAnimationOptions {
  startCube: CubeCoordinates,
  terrainTiles: TerrainTiles
  duration: number
}

export type CompleteCallback = () => void

export class GridSpreadAnimation {
  get duration() {
    return this.options.duration
  }

  get from() {
    return {alpha: 0}
  }

  get to() {
    return {alpha: 1}
  }

  get startCube() {
    return this.options.startCube
  }
  get terrainTiles () {
    return this.options.terrainTiles
  }

  private state: any
  private subject: Array<PIXI.DisplayObject> = []
  private waveCache: {[wave: number]: Array<PIXI.DisplayObject>} = {}
  private tween: RecursiveTween
  private onCompleteCallback?: CompleteCallback = null

  constructor(private options: GridSpreadAnimationOptions) {
    this.state = {...this.from}

    this.tween = new RecursiveTween()
    this.tween.onCycle(this.handleCycle.bind(this))
    this.tween.onUpdate(this.handleUpdate.bind(this))
  }

  start() {
    this.tween.start()
    return this
  }

  stop() {
    this.tween.stop()
    return this
  }

  onComplete(callback: CompleteCallback) {
    this.onCompleteCallback = callback
    return this
  }

  hexToElement(coords: PointLike) {
    return this.terrainTiles.get(coords)
  }

  nextWave(currentCycle: number, last: boolean) {
    if (last) {
      return Array.from(this.terrainTiles.keys()).filter(hex => this.hexToElement(hex).alpha < 0.1).map(hex => this.hexToElement(hex))
    }

    return getNextSpreadingWave(this.startCube, currentCycle)
      .map(point => this.terrainTiles.get(point))
      .filter(sprite => sprite != null)
  }

  createTween(currentCycle: number) {
    return new Tween(this.state).easing(Easing.Sinusoidal.InOut)
  }

  handleUpdate() {
    for (let i = 0; i < this.subject.length; i++) {
      this.applyUpdate(this.subject[i], this.state)
    }
  }

  protected applyUpdate(element: PIXI.DisplayObject, values: {alpha: number}) {
    element.alpha = values.alpha
  }

  handleCycle(oldTween: Tween, currentCycle: number) {
    const cycles = 15

    this.state = {...this.from}
    if (currentCycle > cycles) {
      this.onCompleteCallback && this.onCompleteCallback()
      return false
    }

    const tween = this.createTween(currentCycle)
    tween.to(this.to, Math.max(this.duration - 5 * currentCycle, 10))
    const isLast = currentCycle >= cycles
    this.waveCache[currentCycle] = this.waveCache[currentCycle] || this.nextWave(currentCycle, isLast)
    this.subject = this.waveCache[currentCycle]
    return tween
  }
}
