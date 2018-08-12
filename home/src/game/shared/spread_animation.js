import RecursiveTween from "../../lib/recursive_tween"
import TWEEN from "@tweenjs/tween.js"
import {getNextSpreadingWave, getLastSpreadingWave} from "./grid"

export class GridSpreadAnimation {
  constructor({Grid, grid, startCube, from, to, duration}) {
    this._duration = duration
    this._from = from
    this._to = to

    this.Grid = Grid
    this.Hex = this.Grid.Hex
    this._grid = grid

    const dummyHex = this.Hex()
    this._cubeToCartesian = dummyHex.cubeToCartesian.bind(dummyHex)
    this._onCompleteCallback = null

    this._state = {...from}
    this._startCube = startCube

    this._subject = []
    this._waveCache = {}

    this._tween = new RecursiveTween()
    this._tween.onCycle(this._handleCycle.bind(this))
    this._tween.onUpdate(this._handleUpdate.bind(this))
  }

  start() {
    this._tween.start()
    return this
  }

  stop() {
    this._tween.stop()
    return this
  }

  onComplete(callback) {
    this._onCompleteCallback = callback
    return this
  }

  nextWave(currentCycle, last) {
    if (last) {
      return this._grid.filter(hex => hex.sprite.alpha < 0.1).map(hex => this.hexToElement(hex))
    }

    return getNextSpreadingWave(this._startCube, currentCycle, this._cubeToCartesian)
      .map(point => {
        const hex = this._grid.get(this.Hex(point))
        if (!hex) { return null }
        return this.hexToElement(hex)
      })
      .filter(sprite => sprite != null)
  }

  hexToElement(hex) {
    return hex.sprite
  }

  createTween(currentCycle) {
    return new TWEEN.Tween(this._state).easing(TWEEN.Easing.Sinusoidal.InOut)
  }

  _handleUpdate() {
    for (let i = 0; i < this._subject.length; i++) {
      this._applyUpdate(this._subject[i], this._state)
    }
  }

  _applyUpdate(element, values) {
    Object.assign(element, values)
  }

  _handleCycle(oldTween, currentCycle) {
    this._state = {...this._from}
    if (currentCycle > 15) {
      this._onCompleteCallback && this._onCompleteCallback()
      return false
    }

    const tween = this.createTween(currentCycle)
    tween.to(this._to, Math.max(this._duration - 5 * currentCycle, 10))
    const isLast = currentCycle >= 15
    this._waveCache[currentCycle] = this._waveCache[currentCycle] || this.nextWave(currentCycle, isLast)
    this._subject =this._waveCache[currentCycle]
    return tween
  }
}
