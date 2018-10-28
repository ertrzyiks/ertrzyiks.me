import {Unit} from './unit'

export interface IMovable {
  canMove(): boolean
  step(cost: number): void
}

export function Movable<TBase extends Constructor<Unit>>(Base: TBase, baseMovementPoints: number) {
  return class extends Base implements IMovable {
    protected movementPoints: number = 0

    canMove() {
      return this.movementPoints > 0
    }

    step(cost: number) {

    }

    replenish() {
      super.replenish()

      this.movementPoints = baseMovementPoints
    }
  }
}
