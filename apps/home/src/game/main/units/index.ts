import { Unit, Movable, Sightful } from '../../core/units'
import { Renderable } from '../../shared/renderable'
import { Wolf as WolfUnit } from './wolf'

export const Hero = Sightful(Renderable(Movable(Unit, 3)), 2)
export const Wolf = WolfUnit

