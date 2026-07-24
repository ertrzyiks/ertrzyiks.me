import { Unit, Movable, Damageable, Damaging, Sightful } from '../../core/units'

// Bandit: patrols the road in Stage 2. Higher HP and harder-hitting than any
// wolf (PackLeader tops out at 20 HP / 7 damage) per specs/10-stage-2.md
// "Bandits have higher HP and deal more damage per attack than wolves."
export const Bandit = Sightful(Movable(Damaging(Damageable(Unit, 25), 8), 2), 1)
