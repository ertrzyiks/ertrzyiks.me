export default class RecursiveTween {
  constructor() {
    this._cycle = 0
    this._tween = null

    this._onCycleCallback = null
    this._onUpdateCallback = null
  }

  onCycle(callback) {
    this._onCycleCallback = callback
    return this
  }

  onUpdate(callback) {
    this._onUpdateCallback = callback
    return this
  }

  _initCycle() {
    this._tween = this._onCycleCallback(this._tween, this._cycle)

    if (!this._tween) { return }

    this._tween.onComplete(() => {
      this._cycle++
      this._initCycle()
    })

    this._tween.onUpdate(() => {
      this._onUpdateCallback && this._onUpdateCallback()
    })

    this._tween.start()
  }

  start() {
    this._initCycle()
    return this
  }

  stop() {
    this._tween && this._tween.stop()
    return this
  }

  reset() {
    this._cycle = 0
    return this
  }
}
