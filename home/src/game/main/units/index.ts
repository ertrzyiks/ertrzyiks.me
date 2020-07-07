import {Unit, Movable} from '../../core/units'
import {Renderable} from '../../shared/renderable'

export const Hero = Renderable(Movable(Unit, 100))
