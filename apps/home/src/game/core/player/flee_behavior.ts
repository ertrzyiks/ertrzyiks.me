import type { CubeCoordinates } from "honeycomb-grid";
import { PlayerActionType } from "../player_action";
import { Behavior } from "./behavior";
import { hexDistance } from "../grid";
import { isMovable } from "../units";
import { createMoveContext, directionAway } from "./movement";
import type { StoreProxy } from "../store";
import type { GameEvent } from "../game_event";
import type { State } from "../world";
import type { PlayerAction } from "../player_action";
import type { UnitPosition } from "../board";

export interface FleeBehaviorOptions {
  /**
   * Owner ids of the units the Wanderer flees from — i.e. the human player.
   * The Wanderer flees from the *player*, not from the wolves, so the threat set
   * is explicit rather than "everyone who isn't me". See specs/06-enemy-ai.md.
   */
  fleeFrom: string[];
}

/**
 * Drives the Wanderer NPC on its CPU turn (specs/06-enemy-ai.md "Flee
 * Behavior"):
 *  - each turn it steps in the direction that maximizes distance from the
 *    nearest player unit;
 *  - if no valid step increases that distance (already cornered, or boxed in),
 *    it stays put;
 *  - it never attacks.
 *
 * Occupancy and bounds come from `createMoveContext`, which reads `allUnits`
 * (the full roster exposed by the per-player proxy) so the Wanderer will not try
 * to flee onto a hex held by a wolf or the Hero. Threats are found in the same
 * roster, filtered to the owner ids in `fleeFrom`.
 */
export class FleeBehavior extends Behavior {
  protected fleeFrom: Set<string>;

  constructor(
    store: StoreProxy<GameEvent, State, PlayerAction>,
    options: FleeBehaviorOptions
  ) {
    super(store);
    this.fleeFrom = new Set(options.fleeFrom);
  }

  takeActions() {
    const state = this.store.getState();
    const ctx = createMoveContext(state);
    const roster = state.allUnits ?? state.units;
    const threats = roster.filter((u) => this.fleeFrom.has(u.owner.id));

    // `state.units` is filtered to the Wanderer's own player by the proxy.
    for (const entry of state.units) {
      const unit = entry.unit;
      if (!isMovable(unit) || !unit.canMove()) continue;

      const nearest = this.nearestThreat(entry.position, threats);
      if (!nearest) continue; // no one to flee from → stay

      const dir = directionAway(entry.position, nearest, ctx);
      if (dir == null) continue; // cannot increase distance → stay

      this.store.dispatch({
        type: PlayerActionType.Move,
        unit,
        direction: dir,
      });
    }

    this.store.dispatch({ type: PlayerActionType.EndTurn });
  }

  /** Position of the closest threat by hex distance, or null when there are none. */
  protected nearestThreat(
    from: CubeCoordinates,
    threats: UnitPosition[]
  ): CubeCoordinates | null {
    let best: CubeCoordinates | null = null;
    let bestDist = Infinity;
    for (const t of threats) {
      const dist = hexDistance(from, t.position);
      if (dist < bestDist) {
        bestDist = dist;
        best = t.position;
      }
    }
    return best;
  }
}
