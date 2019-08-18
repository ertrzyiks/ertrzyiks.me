import {GameEvent, GameEventType} from '../game_event'
import {State} from '../world'

const rotate = (value: number, edgeValue: number) => {
  if (value >= edgeValue) {
    return 0
  }

  return value
}

export function gameReducer(state: State, action: GameEvent) {
  switch(action.type) {
    case GameEventType.TurnStart:
      return {
        ...state,
        currentPlayer: state.currentPlayer === null ? 0 : rotate(state.currentPlayer + 1, state.players.length)
      }

    case GameEventType.Move:
      return {
        ...state,
        units: state.units.map(u => {
          if (u.unit != action.unit) { return u }
          return {unit: action.unit, position: action.position}
        })
      }

    case GameEventType.Spawn:
      return {
        ...state,
        units: [
          ...state.units,
          {unit: action.unit, position: action.position}
        ]
      }
  }

  return state
}
