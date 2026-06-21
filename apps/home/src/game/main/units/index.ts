import { Unit, Movable, Sightful } from '../../core/units'
import { Renderable } from '../../shared/renderable'
import { PackLeader as PackLeaderUnit, PackFollower as PackFollowerUnit } from './wolf'

export const Hero = Sightful(Renderable(Movable(Unit, 3)), 2)
export const PackLeader = PackLeaderUnit
export const PackFollower = PackFollowerUnit
