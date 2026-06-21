import type { State } from "./world";
import { type GameEvent, GameEventType } from "./game_event";
import { proxyStore, Store } from "./store";
import { positionAt, cubeKey, hexDistance } from "./grid";
import { type PlayerAction, PlayerActionType } from "./player_action";
import { Unit, isDamaging } from "./units";
import type { Player } from "./player";
import type { UnitPosition } from "./board";

const getUnitPosition = (state: State, unit: Unit) => {
  const u = state.units.filter((u) => u.unit == unit);

  return u[0].position;
};

export function createPlayerStore(store: Store<GameEvent, State>, player: Player) {
  return proxyStore(store, {
    proxyAction: (action: PlayerAction, dispatch) => {
      switch (action.type) {
        case PlayerActionType.EndTurn:
          dispatch({ type: GameEventType.EndTurn });
          break;

        case PlayerActionType.Move:
          dispatch({
            type: GameEventType.Move,
            unit: action.unit,
            position: positionAt(
              getUnitPosition(store.getState(), action.unit),
              action.direction
            ),
          });
          break;

        case PlayerActionType.Attack: {
          // Resolve the target from the *full* roster (the proxied `units` view
          // is filtered to this player, so an enemy target would be invisible).
          // The attack only resolves against an adjacent enemy unit when the
          // attacker still has an attack charge. See specs/04-combat-system.md.
          const all = store.getState().units;
          const targetEntry = all.find(
            (u: UnitPosition) => cubeKey(u.position) === cubeKey(action.position)
          );
          if (!targetEntry) break;
          if (targetEntry.owner.id === player.id) break; // no friendly fire

          const attacker = action.unit;
          if (!isDamaging(attacker) || !attacker.canAttack()) break;

          const attackerPos = getUnitPosition(store.getState(), attacker);
          if (hexDistance(attackerPos, action.position) !== 1) break;

          dispatch({
            type: GameEventType.TakeDamage,
            inflictor: attacker,
            target: targetEntry.unit,
            damage: attacker.damage,
          });
          break;
        }
      }
    },
    proxyState: (s) => ({
      ...s,
      // Expose every unit under `allUnits` while keeping `units` filtered to the
      // owning player (backward compatible). Behaviors and combat read allUnits.
      allUnits: s.units,
      units: s.units.filter((u) => u.owner.id === player.id),
    }),
  });
}
