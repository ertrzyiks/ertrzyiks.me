import {Unit, Movable} from '../../core/units'
import {Renderable} from '../../shared/renderable'

export const Ship = Renderable(Movable(Unit, 100))
