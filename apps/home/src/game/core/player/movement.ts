import type { CubeCoordinates } from "honeycomb-grid";
import { Direction, directions, opposite } from "../direction";
import { positionAt, cubeKey, hexDistance } from "../grid";
import type { State } from "../world";

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

export function createMoveContext(
  state: Pick<State, "tiles" | "units">
): MoveContext {
  const inBounds = new Set(state.tiles.map((t) => cubeKey(t.cube())));
  const occupied = new Set(state.units.map((u) => cubeKey(u.position)));
  return {
    isInBounds: (cube) => inBounds.has(cubeKey(cube)),
    isOccupied: (cube) => occupied.has(cubeKey(cube)),
  };
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
