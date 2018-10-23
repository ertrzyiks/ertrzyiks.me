import {Unit} from './unit'

export interface IMovable {
  canMove(): boolean
  step(cost: number): void
}

export function Movable<TBase extends Constructor<Unit>>(Base: TBase) {
  return class extends Base implements IMovable {
    canMove() {
      return true
    }

    step(cost: number) {

    }

    replenish() {
      super.replenish()
    }
  }
}
