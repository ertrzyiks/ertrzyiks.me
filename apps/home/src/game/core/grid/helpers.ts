import { defineHex, Orientation, type CubeCoordinates, type Point } from "honeycomb-grid";
import { Grid } from "./create_grid";

// Unsized: cartesianToCube/cubeToCartesian below operate on honeycomb-grid's
// offset/grid-index coordinates (matching how TerrainTiles keys its lookup
// map, via hex.coordinates()) — NOT real screen/world pixel coordinates.
const UnsizedHex = defineHex({ orientation: Orientation.FLAT });

const directionalOffset: { [direction: string]: CubeCoordinates } = {
  sw: { r: 1, q: -1, s: 0 },
  s: { r: 1, q: 0, s: -1 },
  n: { r: -1, q: 0, s: 1 },
  ne: { r: -1, q: 1, s: 0 },
  se: { r: 0, q: 1, s: -1 },
  nw: { r: 0, q: -1, s: 1 },
};

export function cartesianToCube(point: Point): CubeCoordinates {
  const hex = new UnsizedHex({ col: point.x, row: point.y });
  return { q: hex.q, r: hex.r, s: hex.s };
}

export function cubeToCartesian(cube: CubeCoordinates): Point {
  const hex = new UnsizedHex(cube);
  return { x: hex.col, y: hex.row };
}

export function pointToCube(point: Point): CubeCoordinates {
  const hex = Grid.pointToHex(point);
  return { q: hex.q, r: hex.r, s: hex.s };
}

export function positionAt(position: CubeCoordinates, direction: string) {
  const offset = directionalOffset[direction];
  return {
    r: position.r + offset.r,
    q: position.q + offset.q,
    s: position.s + offset.s,
  };
}

export function hexDistance(a: CubeCoordinates, b: CubeCoordinates): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

export function cubeKey(pos: CubeCoordinates): string {
  return `${pos.q},${pos.r},${pos.s}`;
}

export function directionBetween(from: CubeCoordinates, to: CubeCoordinates): string | null {
  const diff = { q: to.q - from.q, r: to.r - from.r, s: to.s - from.s };

  for (const [direction, offset] of Object.entries(directionalOffset)) {
    if (diff.q === offset.q && diff.r === offset.r && diff.s === offset.s) {
      return direction;
    }
  }

  return null;
}
