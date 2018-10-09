import {Unit} from './unit'
import {Damageable} from './damageable'
import {IDamaging} from './damaging'

export class WarriorUnit extends Damageable(Unit) implements IDamaging {
  range: number = 0
  cut: number = 10
  crushing: number = 100
}
