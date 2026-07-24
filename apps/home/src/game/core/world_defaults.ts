import type { State } from "./world";

/**
 * The per-playthrough slice of State: everything a fresh World starts with,
 * and everything a Reset (specs/08-stage-system.md "Stage Load") clears back
 * to. Board-derived fields (tiles, worldWidth/worldHeight, cols, rows) are
 * NOT included here — a fresh World derives them from its grid, and a Reset
 * deliberately keeps them (a reload is the same board, not a new one; see
 * Scenario.reload). Shared by World's constructor and the reducer's Reset
 * case so the two invariants can't quietly drift apart — a field added to
 * this list only needs updating in one place.
 */
export const EMPTY_PLAYTHROUGH_STATE: Pick<
  State,
  | "players"
  | "currentPlayerIndex"
  | "currentPlayer"
  | "turn"
  | "units"
  | "revealedTiles"
  | "outcome"
> = {
  players: [],
  currentPlayerIndex: null,
  currentPlayer: null,
  turn: 0,
  units: [],
  revealedTiles: {},
  outcome: null,
};
