import { Unit, Movable, Damageable, Sightful, Leader, Follower } from '../../core/units'

// Pack Leader: tougher (20 HP) and keener-eyed (sight 2) than its followers.
// It wanders the forest and the pack forms up around it. See specs/09-stage-1.md.
export const PackLeader = Leader(Sightful(Movable(Damageable(Unit, 20), 2), 2))

// Pack Follower: the standard forest wolf (15 HP, sight 1). Trails the leader.
export const PackFollower = Follower(Sightful(Movable(Damageable(Unit, 15), 2), 1))
