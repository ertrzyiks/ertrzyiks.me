import type { GameEvent } from "../game_event";
import { GameEventType } from "../game_event";
import type { State } from "../world";
import { EMPTY_PLAYTHROUGH_STATE } from "../world_defaults";
import { isMovable, isSightful, isDamageable, isDamaging } from "../units";
import type { Unit } from "../units";
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

// Shared by Move and Spawn: a unit that can see reveals tiles around a
// position by its sight range; a unit that can't leaves revealedTiles
// unchanged. Owner is passed explicitly rather than derived, since Move
// reads it off the roster entry (movingUnit.owner) while Spawn reads it
// off the action (action.owner).
function revealAroundIfSightful(
  state: State,
  unit: Unit,
  owner: Player,
  position: CubeCoordinates
): Record<string, Record<string, true>> {
  const sightRadius = isSightful(unit) ? unit.sightRange : 0;
  return sightRadius > 0
    ? revealAround(state, owner, position, sightRadius)
    : state.revealedTiles;
}

export function gameReducer(state: State, action: GameEvent) {
  // Terminal state: once a stage has ended, no gameplay actions are accepted.
  // Only GameEnd (idempotent) and Reset (stage reload, clears it) pass through.
  // See specs/05-win-lose-conditions.md "Game End State".
  if (
    state.outcome !== null &&
    action.type !== GameEventType.GameEnd &&
    action.type !== GameEventType.Reset
  ) {
    return state;
  }

  switch (action.type) {
    case GameEventType.GameEnd:
      return { ...state, outcome: action.outcome };

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
        // A turn has begun — advance the counter (spec 01). Narrative turn-N
        // triggers read this, so it must reflect "turn 1" on the very first
        // StartTurn. The terminal-state guard above prevents it advancing once
        // the stage has ended.
        turn: state.turn + 1,
      };

    case GameEventType.Move: {
      const movingUnit = state.units.find((u) => u.unit === action.unit);

      // Movement validity that only the reducer can enforce globally — it is the
      // single source of truth so every mover (human click-to-move and every AI
      // behavior) obeys the same rules. Reject BEFORE mutating the unit so a
      // rejected move never spends a movement point. See specs/02-movement-system.md.
      //
      // Zero-budget: a movable unit with no remaining budget cannot move.
      if (isMovable(action.unit) && !action.unit.canMove()) {
        return state;
      }
      // Occupied-tile: a hex already held by ANOTHER unit is an invalid
      // destination. (Bounds and adjacency are enforced by the callers, which
      // have the tile/click context the reducer lacks — the reducer enforces
      // what it can see across the whole roster: occupancy.)
      const destinationKey = cubeKey(action.position);
      const destinationOccupied = state.units.some(
        (u) => u.unit !== action.unit && cubeKey(u.position) === destinationKey
      );
      if (destinationOccupied) {
        return state;
      }

      if (isMovable(action.unit)) action.unit.step(1);
      const revealedAfterMove = movingUnit
        ? revealAroundIfSightful(
            state,
            action.unit,
            movingUnit.owner,
            action.position
          )
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
      const revealedAfterSpawn = revealAroundIfSightful(
        state,
        action.unit,
        action.owner,
        action.position
      );
      return {
        ...state,
        revealedTiles: revealedAfterSpawn,
        units: [
          ...state.units,
          { unit: action.unit, position: action.position, owner: action.owner },
        ],
      };
    }

    case GameEventType.Reset:
      // Stage reload (specs/08-stage-system.md "Stage Load"): clears every
      // per-playthrough field back to the same defaults a fresh World starts
      // with (EMPTY_PLAYTHROUGH_STATE, shared so the two can't drift), but
      // keeps the board (tiles/worldWidth/worldHeight/cols/rows) — the caller
      // re-adds players and respawns units via a fresh StageDefinition
      // afterward (see Scenario.reload). `players` must be cleared too, not
      // just `units`: PlayerJoin appends unconditionally with no dedup-by-id,
      // so re-adding the same-id players onto a stale roster would silently
      // double turn rotation's player count.
      return {
        ...state,
        ...EMPTY_PLAYTHROUGH_STATE,
      };
  }

  return state;
}
