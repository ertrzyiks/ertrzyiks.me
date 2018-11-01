import {Direction, directions, opposite} from '../direction'
import {Player} from '../player'
import {Unit} from '../units'
import {PlayerActionType} from '../player_action'
import {Controller} from '../controller'
import {positionAt, cubeToCartesian} from '../grid'
import {isMovable, IMovable} from '../units'
import {CubeCoordinates} from 'honeycomb-grid'

export class Explorer extends Player {
  protected lastDirection: {[id: number]: Direction} = {}

  takeActions(ctrl: Controller) {
    this.units.forEach(unit => {
      if (isMovable(unit)) {
        this.exploreWith(ctrl, unit)
      }
    })

    ctrl.do({type: PlayerActionType.EndTurn, player: this})
  }

  protected exploreWith(ctrl: Controller, unit: IMovable) {
    const pos = ctrl.getUnitPosition(unit)
    this.lastDirection[unit.id] = this.randomDirection(this.lastDirection[unit.id], pos)

    ctrl.do({
      type: PlayerActionType.Move,
      player: this,
      unit: unit,
      direction: this.lastDirection[unit.id]
    })
  }

  protected randomDirection(previousDirection: Direction, position: CubeCoordinates) {
    const except = opposite(previousDirection)
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
