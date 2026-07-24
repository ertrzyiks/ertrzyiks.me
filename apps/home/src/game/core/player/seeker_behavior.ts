import type { CubeCoordinates } from "honeycomb-grid";
import { PlayerActionType } from "../player_action";
import { Behavior } from "./behavior";
import { hexDistance } from "../grid";
import { isMovable, isDamaging } from "../units";
import { createMoveContext, directionToward } from "./movement";
import type { StoreProxy } from "../store";
import type { GameEvent } from "../game_event";
import type { State } from "../world";
import type { PlayerAction } from "../player_action";
import type { UnitPosition } from "../board";

export interface SeekerBehaviorOptions {
  /**
   * Owner ids of the units a seeker hunts — i.e. the human player. Explicit
   * rather than "everyone who isn't me", for the same reason FleeBehavior
   * takes `fleeFrom`. See specs/06-enemy-ai.md.
   */
  huntFor: string[];
}

/**
 * Drives a bandit on its CPU turn (specs/06-enemy-ai.md "Seeker Behavior"):
 *  - moves one step toward the nearest hunted unit by shortest hex distance;
 *  - if already adjacent to a hunted unit, it does not move — it attacks
 *    instead, and only when it still has an attack charge left this turn;
 *  - each bandit acts independently; there is no pack-style coordination.
 *
 * Movement uses `createMoveContext`, which reads `allUnits` (the full roster
 * exposed by the per-player proxy) so bandits respect bounds/occupancy for
 * every unit on the board, not just their own. Hunted units come from the
 * same roster, filtered to the owner ids in `huntFor`.
 */
export class SeekerBehavior extends Behavior {
  protected huntFor: Set<string>;

  constructor(
    store: StoreProxy<GameEvent, State, PlayerAction>,
    options: SeekerBehaviorOptions
  ) {
    super(store);
    this.huntFor = new Set(options.huntFor);
  }

  takeActions() {
    const state = this.store.getState();
    const ctx = createMoveContext(state);
    const roster = state.allUnits ?? state.units;
    const targets = roster.filter((u) => this.huntFor.has(u.owner.id));

    // `state.units` is filtered to the bandit's own player by the proxy, and
    // (unlike PackBehavior, which reorders leader-before-followers) iterated
    // as-is: bandits have no leader/follower priority, so array order already
    // is spawn/registration order (spec 06 "Bandit units act in registration
    // order").
    for (const entry of state.units) {
      const unit = entry.unit;
      const nearest = this.nearestTarget(entry.position, targets);
      if (!nearest) continue; // no one to hunt

      if (hexDistance(entry.position, nearest.position) === 1) {
        this.tryAttack(unit, nearest.position);
        continue;
      }

      if (!isMovable(unit) || !unit.canMove()) continue;

      const dir = directionToward(entry.position, nearest.position, ctx);
      if (dir == null) continue; // boxed in → stay

      this.store.dispatch({
        type: PlayerActionType.Move,
        unit,
        direction: dir,
      });
    }

    this.store.dispatch({ type: PlayerActionType.EndTurn });
  }

  protected tryAttack(unit: UnitPosition["unit"], targetPosition: CubeCoordinates) {
    if (!isDamaging(unit) || !unit.canAttack()) return;

    this.store.dispatch({
      type: PlayerActionType.Attack,
      unit,
      position: targetPosition,
    });
  }

  /** Nearest hunted unit by hex distance, or null when there are none. */
  protected nearestTarget(
    from: CubeCoordinates,
    targets: UnitPosition[]
  ): UnitPosition | null {
    let best: UnitPosition | null = null;
    let bestDist = Infinity;
    for (const t of targets) {
      const dist = hexDistance(from, t.position);
      if (dist < bestDist) {
        bestDist = dist;
        best = t;
      }
    }
    return best;
  }
}
