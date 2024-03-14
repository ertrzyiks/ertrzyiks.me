import type { GameEvent } from "../game_event";
import { GameEventType } from "../game_event";
import type { State } from "../world";

const rotate = (value: number, edgeValue: number) => {
  if (value >= edgeValue) {
    return 0;
  }

  return value;
};

export function gameReducer(state: State, action: GameEvent) {
  switch (action.type) {
    case GameEventType.PlayerJoin:
      return {
        ...state,
        players: [...state.players, action.player],
      };
    case GameEventType.EndTurn:
      // Do nothing, waiting for StartTurn
      break;

    case GameEventType.StartTurn:
      const currentPlayerIndex =
        state.currentPlayer === null
          ? 0
          : rotate(state.currentPlayerIndex + 1, state.players.length);
      return {
        ...state,
        currentPlayerIndex,
        currentPlayer: state.players[currentPlayerIndex],
      };

    case GameEventType.Move:
      return {
        ...state,
        units: state.units.map((u) => {
          if (u.unit != action.unit) {
            return u;
          }
          return { unit: action.unit, position: action.position };
        }),
      };

    case GameEventType.Spawn:
      return {
        ...state,
        units: [
          ...state.units,
          { unit: action.unit, position: action.position },
        ],
      };
  }

  return state;
}
