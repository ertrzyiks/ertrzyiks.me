import type { State } from "../world";
import type { GameEvent, GameOutcome } from "../game_event";
import { GameEventType } from "../game_event";
import type { Unit } from "../units";
import { isSightful } from "../units";
import { cubeKey, hexDistance } from "../grid";

// Why this module exists: narrative beats (which lines of dialog play, and when)
// are *scenario-specific* story data, but the rules for deciding *whether* a beat
// should fire are generic and belong in the pure core so they are unit-testable
// without Pixi. The renderer/scenario layer owns dialog presentation and pausing;
// this module only answers "given the current state and the action that just
// resolved, which not-yet-seen events fire now, in definition order?".
// See specs/07-narrative-events.md (and the per-stage scripts in specs/09-11).

export interface DialogLine {
  // Optional speaker name shown above the line (e.g. "Whirley", "Narrator").
  speaker?: string;
  text: string;
}

// The four trigger kinds cover every beat across stages 1-3:
//  - turn: fires at the start of turn N, before the player can act.
//  - tileReached: the player's unit steps onto a named section tile (a goal or
//    a story tile).
//  - lastUnitDefeated: the player has lost their final unit (defeat beats).
//  - unitDefeated: a specific unit (matched by predicate, since units are
//    anonymous mixin instances) has been removed from the board — e.g. a boss.
//  - proximity: a unit owned by `playerId` comes within sight of a unit owned by
//    `ofPlayerId` (range defaults to the watcher's sightRange). Drives the
//    "figure darts between the trees" Wanderer beat.
export type NarrativeTrigger =
  | { kind: "turn"; turn: number }
  | { kind: "tileReached"; playerId: string; sections: string[] }
  | { kind: "lastUnitDefeated"; playerId: string }
  | { kind: "unitDefeated"; predicate: (unit: Unit) => boolean }
  | { kind: "proximity"; playerId: string; ofPlayerId: string; range?: number };

export interface NarrativeEvent {
  id: string;
  trigger: NarrativeTrigger;
  lines: DialogLine[];
  // When true the beat can fire again on every match; otherwise it fires at most
  // once per scenario run (spec 07: "at most once ... unless explicitly marked
  // as repeatable").
  repeatable?: boolean;
  // Marks a beat that is also a win/lose condition. Purely informational for the
  // engine — the actual GameEnd is still owned by core/conditions via the Game,
  // which the renderer sequences to fire *after* the dialog is dismissed. Kept so
  // stages whose win/lose is driven purely by narrative can be wired later.
  endsStage?: GameOutcome;
}

export type NarrativeScript = NarrativeEvent[];

/**
 * Raw StartTurn count (the primitive `{kind: "turn"}` matches against — every
 * player's StartTurn increments it, not just one player's) for the `n`th time
 * the player at `playerIndex` (0-based, by registration order) starts a turn
 * in a `playerCount`-player rotation. E.g. the human (registered first, index
 * 0) in a 3-player rotation has their 3rd turn on the 7th StartTurn overall:
 * `turnForPlayer(0, 3, 3) === 7`.
 *
 * Stage scripts are written in player-facing terms ("Turn 3" meaning the
 * human's 3rd turn), but the "turn" trigger only understands the raw count —
 * this is the one place that translation happens, so a roster change only
 * needs fixing here instead of a hand-computed literal silently going stale
 * in a stage script.
 */
export function turnForPlayer(
  playerIndex: number,
  playerCount: number,
  n: number
): number {
  return (n - 1) * playerCount + (playerIndex + 1);
}

// Pure predicate: does `trigger` match the state produced by `action`? Each kind
// is gated to the action type that can cause it, mirroring how the Game only
// evaluates end conditions after Move/TakeDamage. This gating is what stops a
// "unit defeated" beat from firing on the Spawn events that precede the first
// turn (before the unit even exists, "no matching unit" would be trivially true).
export function triggerMatches(
  trigger: NarrativeTrigger,
  state: State,
  action: GameEvent
): boolean {
  switch (trigger.kind) {
    case "turn":
      return (
        action.type === GameEventType.StartTurn && state.turn === trigger.turn
      );

    case "tileReached": {
      if (action.type !== GameEventType.Move) return false;
      const sections = new Set(trigger.sections);
      return state.units.some((u) => {
        if (u.owner.id !== trigger.playerId) return false;
        const key = cubeKey(u.position);
        const tile = state.tiles.find((t) => cubeKey(t.cube()) === key);
        return tile ? sections.has(tile.sectionName) : false;
      });
    }

    case "lastUnitDefeated":
      return (
        action.type === GameEventType.TakeDamage &&
        !state.units.some((u) => u.owner.id === trigger.playerId)
      );

    case "unitDefeated":
      return (
        action.type === GameEventType.TakeDamage &&
        !state.units.some((u) => trigger.predicate(u.unit))
      );

    case "proximity": {
      if (action.type !== GameEventType.Move) return false;
      const watchers = state.units.filter(
        (u) => u.owner.id === trigger.ofPlayerId
      );
      const targets = state.units.filter((u) => u.owner.id === trigger.playerId);
      return watchers.some((w) => {
        const range =
          trigger.range ?? (isSightful(w.unit) ? w.unit.sightRange : 0);
        if (range <= 0) return false;
        return targets.some((t) => hexDistance(t.position, w.position) <= range);
      });
    }
  }
}

// Stateful over a scenario run: remembers which non-repeatable events have fired
// so each fires at most once. The renderer calls `evaluate` after every world
// update and presents the returned events (in definition order) as dialogs.
export class NarrativeEngine {
  private fired = new Set<string>();

  constructor(private script: NarrativeScript) {}

  // Returns the events that fire for this (state, action), in script definition
  // order — that order is the queue order when several fire at once (spec 07
  // "presented in definition order"). Non-repeatable events are marked fired.
  evaluate(state: State, action: GameEvent): NarrativeEvent[] {
    const triggered: NarrativeEvent[] = [];
    for (const event of this.script) {
      if (!event.repeatable && this.fired.has(event.id)) continue;
      if (triggerMatches(event.trigger, state, action)) {
        if (!event.repeatable) this.fired.add(event.id);
        triggered.push(event);
      }
    }
    return triggered;
  }

  hasFired(id: string): boolean {
    return this.fired.has(id);
  }

  // Clears fired history so the same script can drive a reloaded stage (spec 08
  // "reset on lose"). See specs/08-stage-system.md.
  reset(): void {
    this.fired.clear();
  }
}
