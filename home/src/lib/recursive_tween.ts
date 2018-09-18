import {Tween} from '@tweenjs/tween.js'

export type CycleCallback = (tween: Tween, cycle: number) => Tween
export type UpdateCallback = () => undefined

export default class RecursiveTween {
  private cycle = 0
  private tween: Tween

  private onCycleCallback: CycleCallback
  private onUpdateCallback: UpdateCallback

  onCycle(callback: CycleCallback) {
    this.onCycleCallback = callback
    return this
  }

  onUpdate(callback: UpdateCallback) {
    this.onUpdateCallback = callback
    return this
  }

  private initCycle() {
    this.tween = this.onCycleCallback(this.tween, this.cycle)

    if (!this.tween) { return }

    this.tween.onComplete(() => {
      this.cycle++
      this.initCycle()
    })

    this.tween.onUpdate(() => {
      if (this.onUpdateCallback) {
        this.onUpdateCallback()
      }
    })

    this.tween.start()
  }

  start() {
    this.initCycle()
    return this
  }

  stop() {
    if (this.tween) {
      this.tween.stop()
    }
    return this
  }

  reset() {
    this.cycle = 0
    return this
  }
}
