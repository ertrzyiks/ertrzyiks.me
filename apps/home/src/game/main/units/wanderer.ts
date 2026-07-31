import { Unit, Movable, Sightful } from '../../core/units'
import { Renderable } from '../../shared/renderable'

// The Wanderer: a non-combat NPC. It only moves (budget 3) and sees (sight 2).
// Crucially it has NO Damageable/Damaging mixin, so `isDamageable` is false for
// it — that is exactly what makes it un-attackable: the player-store attack
// translation and the wolves' bite both reject non-damageable targets. It never
// deals damage and cannot be killed. See specs/06-enemy-ai.md ("The Wanderer is
// not a combat unit and cannot be targeted by player attacks") and
// specs/09-stage-1.md.
export const Wanderer = Renderable(Sightful(Movable(Unit, 3), 2), "wanderer")
