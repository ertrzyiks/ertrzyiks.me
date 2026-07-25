import type { CubeCoordinates, PointLike } from "honeycomb-grid";
import { extendHex } from "honeycomb-grid";
import { Grid, Hex as SizedHex } from "./create_grid";

// Unsized: cartesianToCube/cubeToCartesian below operate on honeycomb-grid's
// offset/grid-index coordinates (matching how TerrainTiles keys its lookup
// map, via hex.coordinates()) — NOT real screen/world pixel coordinates.
const Hex = extendHex({ orientation: "flat" });

const directionalOffset: { [direction: string]: CubeCoordinates } = {
  sw: { r: 1, q: -1, s: 0 },
  s: { r: 1, q: 0, s: -1 },
  n: { r: -1, q: 0, s: 1 },
  ne: { r: -1, q: 1, s: 0 },
  se: { r: 0, q: 1, s: -1 },
  nw: { r: 0, q: -1, s: 1 },
};

export function cartesianToCube(point: PointLike) {
  return Hex().cartesianToCube(point);
}

export function cubeToCartesian(point: CubeCoordinates) {
  return Hex().cubeToCartesian(point);
}

// toPoint() (used to position rendered sprites) returns a hex's top-left
// corner in the size-calibrated coordinate space; pointToHex expects that
// same space's *center* point instead — they differ by exactly half a hex's
// width/height. A real click's world coordinates land in toPoint()'s space
// (they come from a sprite's actual rendered position), so that offset has
// to be added back before pointToHex can resolve the right hex.
const halfHexWidth = SizedHex().width() / 2;
const halfHexHeight = SizedHex().height() / 2;

export function pointToCube(point: PointLike): CubeCoordinates {
  return Grid.pointToHex({
    x: point.x + halfHexWidth,
    y: point.y + halfHexHeight,
  }).cube();
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
