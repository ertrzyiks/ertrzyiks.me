import {Unit} from './unit/unit'
import {Controller} from './controller'
import {PlayerActionType} from './player_action'
import {positionAt, cubeToCartesian} from './grid'
import {CubeCoordinates} from 'honeycomb-grid'

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

const directions = [
  'sw', 's', 'n', 'ne', 'se', 'nw'
]

export class CpuPlayer extends Player {

  protected lastDirection: string

  takeActions(ctrl: Controller) {
    const ship = this.units[0]
    const pos = ctrl.getUnitPosition(ship)

    this.lastDirection = this.randomDirection(pos)

    ctrl.do({
      type: PlayerActionType.Move,
      player: this,
      unit: ship,
      direction: this.lastDirection
    })

    ctrl.do({type: PlayerActionType.EndTurn, player: this})
  }

  protected oppositeDirection(direction: string) {
    switch(direction) {
      case 'n': return 's'
      case 's': return 'n'
      case 'ne': return 'sw'
      case 'se': return 'nw'
      case 'nw': return 'se'
      case 'sw': return 'ne'
    }
  }

  protected randomDirection(position: CubeCoordinates) {
    const except = this.oppositeDirection(this.lastDirection)
    let availableDirections = directions.filter(d => d != except)

    const worldWidth = 30
    const worldHeight = 30

    for (let i = 0; i < availableDirections.length; i++) {
      const randomDir = availableDirections.splice(Math.floor(Math.random() * availableDirections.length), 1)[0]
      const newPos = positionAt(position, randomDir)
      const cartesianPos = cubeToCartesian(newPos)
      if (cartesianPos.x == 0 || cartesianPos.x >= worldWidth - 1) continue
      if (cartesianPos.y == 0 || cartesianPos.y >= worldHeight - 1) continue
      return randomDir
    }

    return directions[Math.floor(Math.random() * directions.length)]
  }
}
