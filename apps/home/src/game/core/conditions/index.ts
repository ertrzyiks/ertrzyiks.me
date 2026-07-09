import type { State } from "../world";
import type { GameOutcome } from "../game_event";
import { cubeKey } from "../grid";

// Why this module exists: win/lose rules are *scenario-specific* (which sections
// are goals, which player is the human), so they cannot live in the pure reducer
// which knows neither. They are pure predicates over State instead, evaluated by
// the Game after each gameplay action. Keeping them pure makes every rule and the
// lose-before-win precedence directly unit-testable. See specs/05-win-lose-conditions.md.

export type EndCondition = (state: State) => boolean;

export interface EndConditions {
  win: EndCondition[];
  lose: EndCondition[];
}

export const NO_END_CONDITIONS: EndConditions = { win: [], lose: [] };

// Destination win: any living unit owned by `playerId` stands on a tile whose
// section is one of the goal sections. Dead units are already gone from state.units.
export function destinationReached(
  playerId: string,
  goalSections: string[]
): EndCondition {
  const goals = new Set(goalSections);
  return (state) =>
    state.units.some((u) => {
      if (u.owner.id !== playerId) return false;
      const key = cubeKey(u.position);
      const tile = state.tiles.find((t) => cubeKey(t.cube()) === key);
      return tile ? goals.has(tile.sectionName) : false;
    });
}

// Last-unit-defeated lose: `playerId` has no living units left. The reducer
// removes a unit the moment it drops to <= 0 HP, so "no living units" is simply
// "no units with this owner in state.units".
export function lastUnitDefeated(playerId: string): EndCondition {
  return (state) => !state.units.some((u) => u.owner.id === playerId);
}

// Evaluate all end conditions with lose-before-win precedence: if a win and a
// lose are met by the same action, lose wins (spec 05 "Notable Behavior").
// Multiple conditions of a kind combine with OR.
export function evaluateEndConditions(
  state: State,
  conditions: EndConditions
): GameOutcome | null {
  if (conditions.lose.some((c) => c(state))) return "lose";
  if (conditions.win.some((c) => c(state))) return "win";
  return null;
}
