import { Unit, Movable, Damageable, Sightful } from '../../core/units'

export const Wolf = Sightful(Movable(Damageable(Unit, 15), 2), 1)
