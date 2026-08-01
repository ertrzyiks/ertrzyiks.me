import { Unit } from './unit'

/**
 * A unit that can deal damage. Carries a fixed damage value (defined by the
 * unit type) and a per-turn attack-action budget. The combat system reads
 * `damage` when emitting TakeDamage and consumes a charge via `useAttack`.
 * See specs/04-combat-system.md.
 *
 * Attack charges start empty (like Movable's points and Damageable's hp) and
 * are restored to `attacksPerTurn` at the owner's turn start through replenish.
 * A freshly spawned unit therefore cannot attack until its first turn begins —
 * consistent with the rest of the unit mixins.
 */
export interface IDamaging extends Unit {
  readonly damage: number
  canAttack(): boolean
  useAttack(): void
  hasAttacked(): boolean
}

export function isDamaging(arg: any): arg is IDamaging {
  return !!(arg && typeof arg.damage === 'number' && typeof arg.canAttack === 'function')
}

export function Damaging<TBase extends Constructor<Unit>>(
  Base: TBase,
  damage: number,
  attacksPerTurn: number = 1
) {
  return class extends Base implements IDamaging {
    readonly damage: number = damage
    protected attacksLeft: number = 0
    // Tracks whether the unit has attacked at all this turn, independent of
    // attacksLeft — attack is always a unit's last action (specs/04), so even
    // with attacksPerTurn > 1 a single attack locks out further movement.
    protected attackedThisTurn: boolean = false

    canAttack() {
      return this.attacksLeft > 0
    }

    useAttack() {
      if (this.attacksLeft > 0) {
        this.attacksLeft -= 1
        this.attackedThisTurn = true
      }
    }

    hasAttacked() {
      return this.attackedThisTurn
    }

    replenish() {
      super.replenish()
      this.attacksLeft = attacksPerTurn
      this.attackedThisTurn = false
    }
  }
}
