import {CubeCoordinates} from 'honeycomb-grid'
import {Direction, directions, opposite} from '../direction'
import {Player} from '../player'
import {Unit} from '../units'
import {PlayerAction, PlayerActionType} from '../player_action'
import {positionAt, cubeToCartesian} from '../grid'
import {isMovable, IMovable} from '../units'
import {StoreProxy} from '../store'
import {State} from '../world'
import {GameEvent} from '../game_event'

export class Explorer {
  protected store: StoreProxy<GameEvent, State, PlayerAction>
  protected lastDirection: {[id: number]: Direction} = {}

  constructor(store: StoreProxy<GameEvent, State, PlayerAction>) {
    this.store = store
  }

  takeActions() {
    this.store.getState().units.forEach(u => {
      if (isMovable(u.unit)) {
        this.exploreWith(u.unit)
      }
    })

    this.store.dispatch({type: PlayerActionType.EndTurn})
  }

  protected exploreWith(unit: IMovable) {
    const unitPosition = this.store.getState().units.filter(u => u.unit === unit)[0]
    const pos = unitPosition.position
    this.lastDirection[unit.id] = this.randomDirection(this.lastDirection[unit.id], pos)

    this.store.dispatch({
      type: PlayerActionType.Move,
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
