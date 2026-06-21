import {Unit} from './unit'

export interface IDamageable extends Unit {
  takeDamage(value: number): void
  isAlive(): boolean
}

export function isDamageable(arg: any): arg is IDamageable {
  return !!(arg && typeof arg.takeDamage === 'function' && typeof arg.isAlive === 'function')
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
