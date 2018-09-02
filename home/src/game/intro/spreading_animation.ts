import RecursiveTween from '../../lib/recursive_tween'
import {Tween, Easing} from '@tweenjs/tween.js'
import {getNextSpreadingWave} from '../shared/grid'
import {Grid, Hex, CubeCoordinates} from 'honeycomb-grid'

export interface GridSpreadAnimationOptions {
  grid: Grid<Hex<object>>,
  startCube: CubeCoordinates,
  hexToElement: (hex: Hex<any>) => PIXI.DisplayObject
  duration: number
}

export type CompleteCallback = () => undefined

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

  get grid() {
    return this.options.grid
  }

  get startCube() {
    return this.options.startCube
  }
  get hexToElement () {
    return this.options.hexToElement
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

  private cubeToCartesian(cube: CubeCoordinates) {
    return this.grid[0].cubeToCartesian(cube)
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

  nextWave(currentCycle: number, last: boolean) {
    if (last) {
      return this.grid.filter(hex => this.hexToElement(hex).alpha < 0.1).map(hex => this.hexToElement(hex))
    }

    return getNextSpreadingWave(this.startCube, currentCycle, this.cubeToCartesian.bind(this))
      .map(point => {
        const hex = this.grid.get(point)
        if (!hex) { return null }
        return this.hexToElement(hex)
      })
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
    this.state = {...this.from}
    if (currentCycle > 15) {
      this.onCompleteCallback && this.onCompleteCallback()
      return false
    }

    const tween = this.createTween(currentCycle)
    tween.to(this.to, Math.max(this.duration - 5 * currentCycle, 10))
    const isLast = currentCycle >= 15
    this.waveCache[currentCycle] = this.waveCache[currentCycle] || this.nextWave(currentCycle, isLast)
    this.subject = this.waveCache[currentCycle]
    return tween
  }
}
