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

/**
 * Cube coordinates of the hexes a unit may legally move to *right now*: the
 * in-bounds, unoccupied neighbours of `position` — but only when the unit is
 * Movable and still has movement budget. Returns [] otherwise.
 *
 * Why here: this is the single source of truth the selection highlight in the
 * renderer draws (spec 03 "when a unit is selected, valid move destinations are
 * visually highlighted"; "when the player cannot act — no budget — highlight is
 * absent"). Keeping it a pure function of state makes the highlight rule
 * unit-testable and keeps it in step with the same in-bounds + occupancy +
 * budget checks the caller (game_world's click handler) uses before dispatching
 * a Move. See specs/03-player-input.md.
 */
export function validMoveDestinations(
  unit: unknown,
  position: CubeCoordinates,
  state: Pick<State, "tiles" | "units"> & Partial<Pick<State, "allUnits">>
): CubeCoordinates[] {
  if (!isMovable(unit) || !unit.canMove()) return [];
  const ctx = createMoveContext(state);
  return validDirections(position, ctx).map((d) => positionAt(position, d));
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
