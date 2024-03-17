import { Tween } from "@tweenjs/tween.js";

export type CycleCallback = (
  tween: Tween | null,
  cycle: number
) => Tween | false;
export type UpdateCallback = () => void;

export default class RecursiveTween {
  private cycle = 0;
  private tween: Tween | null = null;

  private onCycleCallback: CycleCallback | null = null;
  private onUpdateCallback: UpdateCallback | null = null;

  onCycle(callback: CycleCallback) {
    this.onCycleCallback = callback;
    return this;
  }

  onUpdate(callback: UpdateCallback) {
    this.onUpdateCallback = callback;
    return this;
  }

  private initCycle() {
    const result = this.onCycleCallback?.(this.tween, this.cycle);

    if (!result) {
      this.tween = null;
      return;
    }

    this.tween = result;

    this.tween.onComplete(() => {
      this.cycle++;
      this.initCycle();
    });

    this.tween.onUpdate(() => {
      if (this.onUpdateCallback) {
        this.onUpdateCallback();
      }
    });

    this.tween.start();
  }

  start() {
    this.initCycle();
    return this;
  }

  stop() {
    if (this.tween) {
      this.tween.stop();
    }
    return this;
  }

  reset() {
    this.cycle = 0;
    return this;
  }
}
