import { Unit, Movable, Damageable, Damaging, Sightful, Leader, Follower } from '../../core/units'

// Pack Leader: tougher (20 HP), keener-eyed (sight 2) and bites harder (7) than
// its followers. It wanders the forest and the pack forms up around it.
// See specs/09-stage-1.md. Wolf damage is not fixed by the specs; values are
// chosen below the bandits' 8 so wolves read as the weaker early threat.
export const PackLeader = Leader(Sightful(Movable(Damaging(Damageable(Unit, 20), 7), 2), 2))

// Pack Follower: the standard forest wolf (15 HP, sight 1, bite 5). Trails the leader.
export const PackFollower = Follower(Sightful(Movable(Damaging(Damageable(Unit, 15), 5), 2), 1))
