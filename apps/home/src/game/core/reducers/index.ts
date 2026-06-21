import type { GameEvent } from "../game_event";
import { GameEventType } from "../game_event";
import type { State } from "../world";
import { isMovable, isSightful, isDamageable, isDamaging } from "../units";
import type { CubeCoordinates } from "honeycomb-grid";
import { hexDistance, cubeKey } from "../grid";
import type { Player } from "../player";

const rotate = (value: number, edgeValue: number) => {
  if (value >= edgeValue) {
    return 0;
  }

  return value;
};

function revealAround(
  state: State,
  owner: Player,
  position: CubeCoordinates,
  range: number
): Record<string, Record<string, true>> {
  const existing = state.revealedTiles[owner.id] || {};
  const updated: Record<string, true> = { ...existing };

  state.tiles.forEach((tile) => {
    if (hexDistance(position, tile.cube()) <= range) {
      updated[cubeKey(tile.cube())] = true;
    }
  });

  return { ...state.revealedTiles, [owner.id]: updated };
}

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
        state.currentPlayer === null || state.currentPlayerIndex === null
          ? 0
          : rotate(state.currentPlayerIndex + 1, state.players.length);
      const currentPlayer = state.players[currentPlayerIndex];
      state.units
        .filter((u) => u.owner.id === currentPlayer.id)
        .forEach((u) => u.unit.replenish());
      return {
        ...state,
        currentPlayerIndex,
        currentPlayer,
      };

    case GameEventType.Move: {
      if (isMovable(action.unit)) action.unit.step(1);
      const movingUnit = state.units.find((u) => u.unit === action.unit);
      const moveRange = isSightful(action.unit) ? action.unit.sightRange : 0;
      const revealedAfterMove =
        movingUnit && moveRange > 0
          ? revealAround(state, movingUnit.owner, action.position, moveRange)
          : state.revealedTiles;
      return {
        ...state,
        revealedTiles: revealedAfterMove,
        units: state.units.map((u) => {
          if (u.unit !== action.unit) return u;
          return { ...u, position: action.position };
        }),
      };
    }

    case GameEventType.TakeDamage: {
      // Apply combat: the attacker spends an attack charge, the target loses HP,
      // and a target reduced to <= 0 HP is removed from the board immediately.
      // Only the resolved target is checked for death — other units (e.g. ones
      // spawned but not yet replenished, which read as 0 HP) are left untouched.
      // See specs/04-combat-system.md.
      if (isDamaging(action.inflictor)) action.inflictor.useAttack();
      if (isDamageable(action.target)) action.target.takeDamage(action.damage);

      const targetDead =
        isDamageable(action.target) && !action.target.isAlive();

      return {
        ...state,
        units: targetDead
          ? state.units.filter((u) => u.unit !== action.target)
          : state.units,
      };
    }

    case GameEventType.Spawn: {
      const spawnRange = isSightful(action.unit) ? action.unit.sightRange : 0;
      const revealedAfterSpawn =
        spawnRange > 0
          ? revealAround(state, action.owner, action.position, spawnRange)
          : state.revealedTiles;
      return {
        ...state,
        revealedTiles: revealedAfterSpawn,
        units: [
          ...state.units,
          { unit: action.unit, position: action.position, owner: action.owner },
        ],
      };
    }
  }

  return state;
}
