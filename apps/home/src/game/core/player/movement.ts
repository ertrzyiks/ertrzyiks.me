import type { CubeCoordinates } from "honeycomb-grid";
import { Direction, directions, opposite } from "../direction";
import { positionAt, cubeKey, hexDistance } from "../grid";
import type { State } from "../world";
import { isMovable } from "../units/movable";
import { isDamaging } from "../units/damaging";
import { isDamageable } from "../units/damageable";

/**
 * Spatial queries an AI behavior needs to pick a legal step: is a hex on the
 * board, and is it already taken. Derived once per turn from the visible state
 * so every direction check is an O(1) set lookup rather than a grid scan.
 *
 * Boundaries are defined by the actual tiles present (not a cartesian bounding
 * box), so irregular maps with holes are handled correctly.
 * See specs/02-movement-system.md and specs/06-enemy-ai.md.
 */
export interface MoveContext {
  isInBounds(cube: CubeCoordinates): boolean;
  isOccupied(cube: CubeCoordinates): boolean;
}

// Every unit on the board, not just the current player's. `allUnits` is set on
// the per-player proxy; fall back to `units` when it is absent (raw state).
function allOccupants(
  state: Pick<State, "units"> & Partial<Pick<State, "allUnits">>
) {
  return state.allUnits ?? state.units;
}

export function createMoveContext(
  state: Pick<State, "tiles" | "units"> & Partial<Pick<State, "allUnits">>
): MoveContext {
  const inBounds = new Set(state.tiles.map((t) => cubeKey(t.cube())));
  // Occupancy must consider every unit, not just the current player's — a wolf
  // should not be able to step onto the (enemy) Hero's tile.
  const occupied = new Set(allOccupants(state).map((u) => cubeKey(u.position)));
  return {
    isInBounds: (cube) => inBounds.has(cubeKey(cube)),
    isOccupied: (cube) => occupied.has(cubeKey(cube)),
  };
}

interface ReachableNode {
  position: CubeCoordinates;
  // How this node was first reached during the flood fill — null for the
  // unit's own starting hex. Lets pathTo() walk the steps back afterward
  // without a second traversal.
  cameFromDir: Direction | null;
  cameFromKey: string | null;
}

/**
 * Flood fill of every hex reachable from `position` within `budget` steps,
 * stepping only through in-bounds, unoccupied hexes (an occupied hex blocks
 * passage entirely, not just landing). Shared by moveRange() (which cares
 * about the reachable set) and pathTo() (which walks the recorded
 * predecessors back into a concrete route) so the two can't drift apart on
 * what "reachable" means.
 */
function reachableNodes(
  position: CubeCoordinates,
  ctx: MoveContext,
  budget: number
): Map<string, ReachableNode> {
  const nodes = new Map<string, ReachableNode>();
  nodes.set(cubeKey(position), { position, cameFromDir: null, cameFromKey: null });
  let frontier: CubeCoordinates[] = [position];

  for (let step = 0; step < budget && frontier.length > 0; step++) {
    const next: CubeCoordinates[] = [];
    for (const pos of frontier) {
      for (const d of validDirections(pos, ctx)) {
        const neighbour = positionAt(pos, d);
        const key = cubeKey(neighbour);
        if (nodes.has(key)) continue;
        nodes.set(key, { position: neighbour, cameFromDir: d, cameFromKey: cubeKey(pos) });
        next.push(neighbour);
      }
    }
    frontier = next;
  }

  return nodes;
}

/**
 * Cube coordinates of every hex a unit could end its move on *right now*: not
 * just the adjacent ring, but every hex reachable within its full remaining
 * movement budget. Returns [] when the unit isn't Movable or has no budget
 * left.
 *
 * Why here: this is the single source of truth the selection highlight in the
 * renderer draws (spec 03 "when a unit is selected, valid move destinations are
 * visually highlighted"; "when the player cannot act — no budget — highlight is
 * absent") and what a click is allowed to auto-path to in one action (ADR-0003
 * — superseding the original "no multi-step pathfinding" scope note). Keeping
 * it a pure function of state makes the highlight/auto-path rule unit-testable
 * and keeps it in step with the same in-bounds + occupancy + budget checks the
 * caller (game_world's click handler) uses before dispatching a Move.
 */
export function moveRange(
  unit: unknown,
  position: CubeCoordinates,
  state: Pick<State, "tiles" | "units"> & Partial<Pick<State, "allUnits">>
): CubeCoordinates[] {
  if (!isMovable(unit) || !unit.canMove()) return [];
  const ctx = createMoveContext(state);
  const nodes = reachableNodes(position, ctx, unit.remainingBudget());
  nodes.delete(cubeKey(position));
  return [...nodes.values()].map((n) => n.position);
}

/**
 * The sequence of directions to walk `unit` from `position` to `target`
 * within its remaining movement budget, stepping only through in-bounds,
 * unoccupied hexes — i.e. a concrete route through moveRange()'s reachable
 * set. Returns null when `target` isn't reachable this turn (out of budget,
 * off the board, blocked, or `target` equals `position`). Powers auto-path
 * (ADR-0003): a click on any moveRange() hex resolves to the exact steps
 * needed, not just a single adjacent hop.
 */
export function pathTo(
  unit: unknown,
  position: CubeCoordinates,
  target: CubeCoordinates,
  state: Pick<State, "tiles" | "units"> & Partial<Pick<State, "allUnits">>
): Direction[] | null {
  if (!isMovable(unit) || !unit.canMove()) return null;
  if (cubeKey(position) === cubeKey(target)) return null;

  const ctx = createMoveContext(state);
  const nodes = reachableNodes(position, ctx, unit.remainingBudget());
  const targetNode = nodes.get(cubeKey(target));
  if (!targetNode || targetNode.cameFromDir === null) return null;

  const path: Direction[] = [];
  let node: ReachableNode | undefined = targetNode;
  while (node && node.cameFromDir !== null) {
    path.push(node.cameFromDir);
    node = node.cameFromKey ? nodes.get(node.cameFromKey) : undefined;
  }
  return path.reverse();
}

/**
 * Cube coordinates of the adjacent enemy units a unit may legally attack
 * *right now*: Damageable units, owned by someone other than `ownerId`, one
 * hex away — but only when the attacker is Damaging and still has an attack
 * charge. Returns [] otherwise.
 *
 * Mirrors the player_store's own Attack validation (adjacency, Damageable
 * target, attacker charge) so a click handler can decide up front whether a
 * clicked enemy hex is a legal target. See specs/03-player-input.md and
 * specs/04-combat-system.md.
 */
export function validAttackTargets(
  unit: unknown,
  position: CubeCoordinates,
  ownerId: string,
  state: Pick<State, "units"> & Partial<Pick<State, "allUnits">>
): CubeCoordinates[] {
  if (!isDamaging(unit) || !unit.canAttack()) return [];
  return allOccupants(state)
    .filter(
      (u) =>
        u.owner.id !== ownerId &&
        isDamageable(u.unit) &&
        hexDistance(position, u.position) === 1
    )
    .map((u) => u.position);
}

/**
 * Whether `unit` actually ended up at `position` in `state`. The reducer
 * silently no-ops an invalid Move (zero budget, occupied destination, out of
 * bounds) rather than throwing, so a dispatched Move can't be assumed to have
 * succeeded just because it fired — a subscriber (e.g. the renderer deciding
 * whether to animate a step) must check the resulting state instead.
 */
export function moveSucceeded(
  unit: unknown,
  position: CubeCoordinates,
  state: Pick<State, "units">
): boolean {
  const entry = state.units.find((u) => u.unit === unit);
  return !!entry && cubeKey(entry.position) === cubeKey(position);
}

/** Directions whose neighbouring hex is on the board and unoccupied. */
export function validDirections(
  position: CubeCoordinates,
  ctx: MoveContext
): Direction[] {
  return directions.filter((d) => {
    const target = positionAt(position, d);
    return ctx.isInBounds(target) && !ctx.isOccupied(target);
  });
}

/**
 * Valid step that most reduces hex distance to `target`.
 * Returns null when no legal step strictly shrinks the distance — the caller
 * should then stay put rather than wander away (e.g. a follower already next
 * to its leader, or one boxed in). Ties resolve to the first direction in
 * canonical order, which the spec allows ("chosen arbitrarily").
 */
export function directionToward(
  position: CubeCoordinates,
  target: CubeCoordinates,
  ctx: MoveContext
): Direction | null {
  const current = hexDistance(position, target);
  let best: Direction | null = null;
  let bestDist = current;
  for (const d of validDirections(position, ctx)) {
    const dist = hexDistance(positionAt(position, d), target);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

/**
 * Valid step that most increases hex distance from `target` (flee).
 * Returns null when no legal step increases the distance — the fleer stays put.
 */
export function directionAway(
  position: CubeCoordinates,
  target: CubeCoordinates,
  ctx: MoveContext
): Direction | null {
  const current = hexDistance(position, target);
  let best: Direction | null = null;
  let bestDist = current;
  for (const d of validDirections(position, ctx)) {
    const dist = hexDistance(positionAt(position, d), target);
    if (dist > bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

/**
 * Random valid step, avoiding the hex the unit just came from (the opposite of
 * `cameFrom`) unless that backtrack is the only legal move. Returns null when
 * the unit is completely boxed in. `rng` is injectable for deterministic tests.
 */
export function randomValidDirection(
  position: CubeCoordinates,
  ctx: MoveContext,
  cameFrom?: Direction | null,
  rng: () => number = Math.random
): Direction | null {
  const valid = validDirections(position, ctx);
  if (valid.length === 0) return null;

  const back = cameFrom != null ? opposite(cameFrom) : null;
  const preferred = back ? valid.filter((d) => d !== back) : valid;
  const pool = preferred.length > 0 ? preferred : valid;

  return pool[Math.floor(rng() * pool.length)];
}
