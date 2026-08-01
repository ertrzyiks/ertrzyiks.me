import {Unit} from './unit'

export interface IDamageable extends Unit {
  takeDamage(value: number): void
  isAlive(): boolean
  currentHp(): number
  maxHp(): number
}

export function isDamageable(arg: any): arg is IDamageable {
  return !!(arg && typeof arg.takeDamage === 'function' && typeof arg.isAlive === 'function')
}

export function Damageable<TBase extends Constructor<Unit>>(Base: TBase, maxHitPoints: number) {
  return class extends Base implements IDamageable {
    protected hp: number = 0

    takeDamage(value: number) {
      this.hp -= value
    }

    isAlive() {
      return this.hp > 0
    }

    // Read access for HP-driven UI (issue #220's health bar) — hp itself
    // stays protected so only takeDamage/replenish can mutate it.
    currentHp() {
      return this.hp
    }

    maxHp() {
      return maxHitPoints
    }

    replenish() {
      super.replenish()
      this.hp = maxHitPoints
    }
  }
}
