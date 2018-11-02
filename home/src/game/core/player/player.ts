import {Unit} from '../units'
import {Controller} from '../controller'

export enum PlayerColor {
  BLUE,
  RED
}

export abstract class Player {
  public units: Array<Unit> = []

  constructor(public readonly color: PlayerColor) {}

  owns (unit: Unit) {
    return this.units.indexOf(unit) != -1
  }

  abstract takeActions(ctrl: Controller): void
}
