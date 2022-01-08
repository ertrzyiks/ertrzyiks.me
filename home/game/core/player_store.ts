import {State} from './world'
import {GameEvent, GameEventType} from './game_event'
import {proxyStore, Store} from './store'
import {positionAt} from './grid'
import {PlayerAction, PlayerActionType} from './player_action'
import {Unit} from './units'
import {Player} from './player'

const getUnitPosition = (state: State, unit: Unit) => {
  const u = state.units.filter(u => u.unit == unit)

  return u[0].position
}

export function createPlayerStore (store: Store<GameEvent, State>, player: Player) {
  return proxyStore(store, {
    proxyAction: (action: PlayerAction, dispatch) => {
      switch(action.type) {
        case PlayerActionType.EndTurn:
          dispatch({type: GameEventType.EndTurn})
          break

        case PlayerActionType.Move:
          dispatch({
            type: GameEventType.Move,
            unit: action.unit,
            position: positionAt(getUnitPosition(store.getState(), action.unit), action.direction)
          })
          break
      }
    },
    proxyState: (s) => s
  })
}
