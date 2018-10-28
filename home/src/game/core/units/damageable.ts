import {Unit} from './unit'

export interface IDamageable {
  takeDamage(value: number): void
  isAlive(): boolean
}

export function Damageable<TBase extends Constructor<Unit>>(Base: TBase, maxHp: number) {
  return class extends Base implements IDamageable {
    protected hp: number = 0

    takeDamage(value: number) {
      this.hp -= value
    }

    isAlive() {
      return this.hp > 0
    }

    replenish() {
      super.replenish()
      this.hp = maxHp
    }
  }
}
