import { Unit, Movable, Damageable, Damaging, Sightful } from '../../core/units'
import { Renderable } from '../../shared/renderable'
import { PackLeader as PackLeaderUnit, PackFollower as PackFollowerUnit } from './wolf'

// Whirley: 30 HP, deals 10 per hit (one attack/turn), moves 3, sees 2.
// HP/damage are not fixed by the specs; chosen so Whirley out-hits a lone wolf
// but can be worn down by the pack. Damageable so the lose condition can fire.
export const Hero = Sightful(Renderable(Movable(Damaging(Damageable(Unit, 30), 10), 3)), 2)
export const PackLeader = PackLeaderUnit
export const PackFollower = PackFollowerUnit
