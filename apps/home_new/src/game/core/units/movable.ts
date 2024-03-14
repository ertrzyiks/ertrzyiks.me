import {Unit} from './unit'

export interface IMovable extends Unit {
  canMove(): boolean
  step(cost: number): void
}

export function isMovable(arg: any): arg is IMovable {
  return arg && arg.canMove && typeof(arg.canMove) == 'function'
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
