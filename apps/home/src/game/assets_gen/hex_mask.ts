// A flat-top hexagon (flat edges on top/bottom, points on left/right) —
// matches the "flat" orientation honeycomb-grid is configured with
// elsewhere in the game (see core/grid/create_grid.ts) — inscribed in a
// width x height bounding box.
//
// Sizing note for anything composited on top of this shape (e.g. a unit
// sprite over the owner-color tint hex in game_world.ts): the hex only
// spans the *full* bounding-box width at its vertical midpoint. It tapers
// linearly to half that width at the very top and bottom edges (the
// left/right points sit at height*0.5, not at the corners). A silhouette
// that's tall *and* wide near its top or bottom (e.g. a quadruped with a
// head at one end and legs at the other, as opposed to a narrow humanoid)
// can be narrower than the bounding box and still poke past the hex's
// edge there — see the wolf sprite fix on gh issue #190. When designing
// such a silhouette, keep its horizontal extent well inside the taper at
// whatever row it actually occupies, not just inside the full bounding box.
function hexVertices(width: number, height: number): [number, number][] {
  return [
    [width * 0.25, 0],
    [width * 0.75, 0],
    [width, height * 0.5],
    [width * 0.75, height],
    [width * 0.25, height],
    [0, height * 0.5],
  ];
}

export function isInsideFlatTopHex(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  const vertices = hexVertices(width, height);
  let sign = 0;

  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    const cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);

    if (cross === 0) continue; // exactly on this edge's line

    const edgeSign = cross > 0 ? 1 : -1;
    if (sign === 0) {
      sign = edgeSign;
    } else if (edgeSign !== sign) {
      return false;
    }
  }

  return true;
}

export function flatTopHexMask(width: number, height: number): boolean[][] {
  const mask: boolean[][] = [];

  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      row.push(isInsideFlatTopHex(x + 0.5, y + 0.5, width, height));
    }
    mask.push(row);
  }

  return mask;
}

export function upscaleNearestNeighbor<T>(grid: T[][], scale: number): T[][] {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new Error(`scale must be a positive integer, got ${scale}`);
  }

  const scaled: T[][] = [];

  for (const row of grid) {
    const scaledRow: T[] = [];
    for (const cell of row) {
      for (let i = 0; i < scale; i++) {
        scaledRow.push(cell);
      }
    }
    for (let i = 0; i < scale; i++) {
      scaled.push(scaledRow.slice());
    }
  }

  return scaled;
}
