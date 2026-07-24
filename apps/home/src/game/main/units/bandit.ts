import { Unit, Movable, Damageable, Damaging, Sightful } from '../../core/units'

// Bandit: patrols the road in Stage 2. Higher HP and harder-hitting than any
// wolf (PackLeader tops out at 20 HP / 7 damage) per specs/10-stage-2.md
// "Bandits have higher HP and deal more damage per attack than wolves."
export const Bandit = Sightful(Movable(Damaging(Damageable(Unit, 25), 8), 2), 1)

// Bandit Captain: guards the camp's center in Stage 3. Higher HP, harder-hitting,
// and keener-eyed than a standard Bandit (25 HP / 8 damage / sight 1) per
// specs/11-stage-3.md "Hit points: higher than a standard bandit. Damage per
// attack: higher than a standard bandit." Uses seeker behavior like standard
// bandits (spec 11 "Behavior: seeker — moves toward Whirley and attacks when
// adjacent"), so no separate AI class is needed, only different stats.
// "Visual distinction from standard bandits" (spec 11) is a renderer concern,
// not yet addressed — see IMPLEMENTATION_PLAN.md.
export const BanditCaptain = Sightful(Movable(Damaging(Damageable(Unit, 40), 12), 2), 2)
