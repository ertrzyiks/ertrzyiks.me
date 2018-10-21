import {Unit} from './unit'

export interface IDamageable {
  readonly healthPoints: number
  readonly maxHealthPoints: number
  takeDamage(value: number): void
  isAlive(): boolean
}

export function Damageable<TBase extends Constructor<Unit>>(Base: TBase) {
  return class extends Base implements IDamageable {
    private maxHp: number
    private hp: number

    get healthPoints() { return this.hp }
    get maxHealthPoints() { return this.maxHp }

    takeDamage(value: number) {
      this.hp -= value
    }

    isAlive() {
      return this.hp > 0
    }

    replenish() {
      super.replenish()
      this.hp = this.maxHp
    }
  }
}
