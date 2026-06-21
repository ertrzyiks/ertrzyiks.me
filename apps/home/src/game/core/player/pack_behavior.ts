import type { CubeCoordinates } from "honeycomb-grid";
import { PlayerActionType } from "../player_action";
import { Behavior } from "./behavior";
import { Direction } from "../direction";
import { hexDistance } from "../grid";
import { isMovable, type IMovable } from "../units";
import { isPackLeader } from "../units/pack";
import {
  createMoveContext,
  directionToward,
  randomValidDirection,
  type MoveContext,
} from "./movement";
import type { StoreProxy } from "../store";
import type { GameEvent } from "../game_event";
import type { State } from "../world";
import type { PlayerAction } from "../player_action";
import type { UnitPosition } from "../board";

/**
 * Per-unit "way I came from" memory. Kept outside the behavior instance because
 * a fresh behavior is created each CPU turn, but the Pack Leader's no-backtrack
 * rule must hold across turns. The scenario owns one of these and passes it in.
 */
export interface PackMemory {
  lastDirection: Record<number, Direction>;
}

export function createPackMemory(): PackMemory {
  return { lastDirection: {} };
}

/**
 * Drives the wolf pack on its CPU turn (specs/06-enemy-ai.md):
 *  - the Pack Leader wanders in a random valid direction, avoiding backtracking;
 *  - each Pack Follower takes one step toward the leader, or stays if adjacent;
 *  - if the leader is gone (defeated), the pack dissolves and every follower
 *    wanders like the leader did.
 *
 * Units act leader-first then followers, one step each. Attack-on-adjacency is
 * intentionally not emitted here: it depends on the combat system (TakeDamage),
 * which is a later increment.
 */
export class PackBehavior extends Behavior {
  protected memory: PackMemory;
  protected rng: () => number;

  constructor(
    store: StoreProxy<GameEvent, State, PlayerAction>,
    memory: PackMemory = createPackMemory(),
    rng: () => number = Math.random
  ) {
    super(store);
    this.memory = memory;
    this.rng = rng;
  }

  takeActions() {
    const state = this.store.getState();
    const ctx = createMoveContext(state);

    // The pack only coheres around a living leader. If none is present the pack
    // has dissolved and followers fall back to wandering.
    const leaderEntry = state.units.find(
      (u) => isPackLeader(u.unit) && this.isAlive(u.unit)
    );
    const leaderPos = leaderEntry ? leaderEntry.position : null;

    // Leader acts first, then followers (spec action ordering).
    const ordered = [...state.units].sort(
      (a, b) => this.actOrder(a.unit) - this.actOrder(b.unit)
    );

    for (const entry of ordered) {
      const unit = entry.unit;
      if (!isMovable(unit) || !unit.canMove()) continue;

      if (isPackLeader(unit)) {
        this.wander(unit, entry.position, ctx);
      } else if (leaderPos) {
        this.trail(unit, entry.position, leaderPos, ctx);
      } else {
        this.wander(unit, entry.position, ctx);
      }
    }

    this.store.dispatch({ type: PlayerActionType.EndTurn });
  }

  /** Step toward the leader; stay put when already adjacent or boxed in. */
  protected trail(
    unit: IMovable,
    position: CubeCoordinates,
    leaderPos: CubeCoordinates,
    ctx: MoveContext
  ) {
    if (hexDistance(position, leaderPos) <= 1) return;

    const dir = directionToward(position, leaderPos, ctx);
    if (dir == null) return;

    this.move(unit, dir);
  }

  /** Random step avoiding the last direction's return path. */
  protected wander(unit: IMovable, position: CubeCoordinates, ctx: MoveContext) {
    const dir = randomValidDirection(
      position,
      ctx,
      this.memory.lastDirection[unit.id] ?? null,
      this.rng
    );
    if (dir == null) return;

    this.move(unit, dir);
  }

  protected move(unit: IMovable, direction: Direction) {
    this.memory.lastDirection[unit.id] = direction;
    this.store.dispatch({
      type: PlayerActionType.Move,
      unit,
      direction,
    });
  }

  protected actOrder(unit: UnitPosition["unit"]): number {
    return isPackLeader(unit) ? 0 : 1;
  }

  /** Units without a hit-point concept are treated as always alive. */
  protected isAlive(unit: UnitPosition["unit"]): boolean {
    const maybe = unit as { isAlive?: () => boolean };
    return typeof maybe.isAlive === "function" ? maybe.isAlive() : true;
  }
}
