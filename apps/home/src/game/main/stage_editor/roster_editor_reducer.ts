import type { Board } from "../../core/board";
import { RosterEditorEventType, type RosterEditorEvent } from "./roster_editor_event";
import type { EnemyRosterData, RosterSpawnData, StageRosterData } from "./stage_roster";

/**
 * The stage-roster half of the editor's authoring state (issue #170: "The
 * event/reducer surface is extended to cover stage-roster concerns —
 * spawns, enemy rosters, win section — not just board tiles"). Deliberately
 * separate from `../../core/world`'s `State` (which the existing board-tile
 * editor in `src/game/editor/reducer.ts` reuses for its own Pixi-rendering
 * purposes): `State` is the live *gameplay* shape shared by every reducer in
 * `core/`, and bolting authoring-only fields (draft rosters, a `validSections`
 * lookup, an in-progress error) onto it would leak editor concerns into code
 * that has nothing to do with authoring. `validSections` is this state's own
 * window onto "the current board" (issue user story 12) — populated once at
 * `createRosterEditorState` time from a `Board`, not re-derived from the
 * board-tile reducer's own state; `StageEditorWorld` (`editor_world.ts`)
 * composes the two reducers behind one Pixi UI and keeps this window fresh
 * via `refreshValidSections`, below, whenever a board-tile edit could have
 * changed section names.
 */
export interface RosterEditorState {
  readonly validSections: ReadonlySet<string>;
  readonly playerSpawns: RosterSpawnData[];
  readonly enemies: EnemyRosterData[];
  readonly winSection: string;
  /**
   * The reason the most recent dispatch was rejected, or null. Sits on state
   * rather than being thrown so a UI can render it inline next to whatever
   * the author just tried (issue user story 12: "save blocked with an inline
   * error"), and so Seam 2 tests can assert it like any other state field.
   */
  readonly error: string | null;
}

export function createRosterEditorState(board: Board): RosterEditorState {
  return {
    validSections: new Set(board.tiles.map((tile) => tile.sectionName)),
    playerSpawns: [],
    enemies: [],
    winSection: "",
    error: null,
  };
}

/**
 * The load-time counterpart to `createRosterEditorState`: seeds authoring
 * state from a previously-saved `StageRosterData` instead of starting empty
 * (issue #170 user story 16: "reopen a previously saved stage and see its
 * board/spawns/rosters/win section reflected in the editor"). Trusts `data`
 * as-is rather than re-running `validateAgainstBoard` — a stage that was
 * saved is assumed valid against the board it was saved with, and `board`
 * here is that same loaded board, not one an author has since edited.
 */
export function loadRosterEditorState(data: StageRosterData, board: Board): RosterEditorState {
  return {
    validSections: new Set(board.tiles.map((tile) => tile.sectionName)),
    playerSpawns: data.playerSpawns,
    enemies: data.enemies,
    winSection: data.winSection,
    error: null,
  };
}

/**
 * Recomputes `validSections` from the board's current tile section names,
 * keeping everything else untouched. Not a dispatched `RosterEditorEvent`:
 * renaming a tile's section is a board-tile authoring action (the OTHER
 * reducer's concern — see this module's own doc comment on why the two stay
 * separate), so `StageEditorWorld` (the Pixi world composing both reducers,
 * now that that "later, separate slice" mentioned above has arrived) calls
 * this directly whenever the board changes, rather than routing board edits
 * through this reducer's dispatch surface.
 */
export function refreshValidSections(state: RosterEditorState, board: Board): RosterEditorState {
  return { ...state, validSections: new Set(board.tiles.map((tile) => tile.sectionName)) };
}

/** True if `section` is already claimed by a player or enemy spawn (user story 13: no two spawns share a section). */
function isSectionTaken(state: RosterEditorState, section: string): boolean {
  if (state.playerSpawns.some((spawn) => spawn.section === section)) return true;
  return state.enemies.some((roster) => roster.spawns.some((spawn) => spawn.section === section));
}

function rejectingSpawn(
  state: RosterEditorState,
  section: string
): RosterEditorState | null {
  if (!state.validSections.has(section)) {
    return { ...state, error: `Unknown section "${section}"` };
  }
  if (isSectionTaken(state, section)) {
    return { ...state, error: `Section "${section}" is already assigned to a spawn` };
  }
  return null;
}

/**
 * Builds up `StageRosterData` from a sequence of authoring events, rejecting
 * (issue user stories 12/13) any spawn/win-section that references a section
 * absent from `state.validSections`, and any spawn whose section is already
 * taken by another spawn — a rejected event returns state with only `error`
 * changed, leaving the data untouched, so invalid transitions never reach a
 * state `toStageRosterData` could hand to the resolver.
 */
export function rosterEditorReducer(
  state: RosterEditorState,
  action: RosterEditorEvent
): RosterEditorState {
  switch (action.type) {
    case RosterEditorEventType.AddPlayerSpawn: {
      const rejected = rejectingSpawn(state, action.section);
      if (rejected) return rejected;

      return {
        ...state,
        error: null,
        playerSpawns: [
          ...state.playerSpawns,
          { section: action.section, unitKey: action.unitKey },
        ],
      };
    }

    case RosterEditorEventType.RemovePlayerSpawn: {
      if (!state.playerSpawns[action.index]) {
        return { ...state, error: `No player spawn at index ${action.index}` };
      }
      return {
        ...state,
        error: null,
        playerSpawns: state.playerSpawns.filter((_, index) => index !== action.index),
      };
    }

    case RosterEditorEventType.AddEnemyRoster:
      return {
        ...state,
        error: null,
        enemies: [
          ...state.enemies,
          {
            factionKey: action.factionKey,
            behaviorKey: action.behaviorKey,
            turnEventName: action.turnEventName,
            spawns: [],
          },
        ],
      };

    case RosterEditorEventType.RemoveEnemyRoster: {
      if (!state.enemies[action.rosterIndex]) {
        return { ...state, error: `No enemy roster at index ${action.rosterIndex}` };
      }
      return {
        ...state,
        error: null,
        enemies: state.enemies.filter((_, index) => index !== action.rosterIndex),
      };
    }

    case RosterEditorEventType.AddEnemyRosterSpawn: {
      if (!state.enemies[action.rosterIndex]) {
        return { ...state, error: `No enemy roster at index ${action.rosterIndex}` };
      }

      const rejected = rejectingSpawn(state, action.section);
      if (rejected) return rejected;

      return {
        ...state,
        error: null,
        enemies: state.enemies.map((roster, index) =>
          index === action.rosterIndex
            ? {
                ...roster,
                spawns: [
                  ...roster.spawns,
                  { section: action.section, unitKey: action.unitKey },
                ],
              }
            : roster
        ),
      };
    }

    case RosterEditorEventType.RemoveEnemyRosterSpawn: {
      const roster = state.enemies[action.rosterIndex];
      if (!roster) {
        return { ...state, error: `No enemy roster at index ${action.rosterIndex}` };
      }
      if (!roster.spawns[action.spawnIndex]) {
        return { ...state, error: `No spawn at index ${action.spawnIndex} on that roster` };
      }
      return {
        ...state,
        error: null,
        enemies: state.enemies.map((roster, index) =>
          index === action.rosterIndex
            ? {
                ...roster,
                spawns: roster.spawns.filter((_, spawnIndex) => spawnIndex !== action.spawnIndex),
              }
            : roster
        ),
      };
    }

    case RosterEditorEventType.SetWinSection: {
      if (!state.validSections.has(action.section)) {
        return { ...state, error: `Unknown section "${action.section}"` };
      }
      return { ...state, error: null, winSection: action.section };
    }
  }
}

/** The data `StageEditorWorld`'s Save writes to disk / hands to `resolveStageDefinition`. */
export function toStageRosterData(state: RosterEditorState): StageRosterData {
  return {
    playerSpawns: state.playerSpawns,
    enemies: state.enemies,
    winSection: state.winSection,
  };
}

/**
 * Re-validates every section reference against the board's CURRENT sections
 * (unlike `validSections`, which a rename only widens/narrows going forward
 * — see `refreshValidSections`'s doc comment — existing spawns/winSection
 * are never retroactively invalidated when a section is renamed out from
 * under them). Called at Save time so a stale reference (added, then its
 * board tile's section later renamed) can't be silently persisted — issue
 * #170 user story 12: "save blocked ... if a spawn/roster/win-section
 * references a section name that doesn't exist on the current board."
 * Returns an error message, or null if everything still resolves.
 */
export function validateAgainstBoard(state: RosterEditorState, board: Board): string | null {
  const currentSections = new Set(board.tiles.map((tile) => tile.sectionName));

  for (const spawn of state.playerSpawns) {
    if (!currentSections.has(spawn.section)) {
      return `Player spawn references section "${spawn.section}", which no longer exists on the board`;
    }
  }

  for (const roster of state.enemies) {
    for (const spawn of roster.spawns) {
      if (!currentSections.has(spawn.section)) {
        return `"${roster.factionKey}" roster spawn references section "${spawn.section}", which no longer exists on the board`;
      }
    }
  }

  if (state.winSection && !currentSections.has(state.winSection)) {
    return `Win section "${state.winSection}" no longer exists on the board`;
  }

  return null;
}
