import type { Grid } from "honeycomb-grid";
import type { GameTileHex } from "../board";

interface WorldDimensions {
  worldWidth: number;
  worldHeight: number;
  // Flat-top hexes at col/row 0 extend into negative X/Y — their own
  // corners reach half a tile-width/height above and left of their
  // center — so [0, 0] is NOT the grid's true top-left corner. Callers
  // that need the grid's actual visible extent (e.g. centering the
  // camera on it) must offset by these, not assume the box starts at the
  // origin the way worldWidth/worldHeight (measured from x=0/y=0, matching
  // the clamp plugin's own origin-relative bounds) do.
  minX: number;
  minY: number;
}

export function getGridBoundingBox(grid: Grid<GameTileHex>): WorldDimensions {
  if (grid.size === 0) throw new Error("No hex found in grid");

  // honeycomb-grid v4's `corners` getter already returns absolute
  // (world-space) points — each one is the hex's own x/y plus a corner
  // offset (see the library's flat/pointy corner formulas) — not points
  // relative to the hex's origin the way v1's did. Adding a hex's own
  // position on top of that (as the v1-era version of this function did)
  // double-counts it, inflating the computed bounding box to roughly double
  // the grid's real size for any hex far from the origin — which is exactly
  // what silently broke MainWorld's camera centering (see main/game_world.ts).
  //
  // The furthest corners aren't necessarily on the first/last hex (column
  // offsetting in flat-top layouts can push another hex's corner further
  // out), so every hex's corners are scanned rather than assuming an
  // extreme hex.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const hex of grid) {
    for (const corner of hex.corners) {
      if (corner.x < minX) minX = corner.x;
      if (corner.y < minY) minY = corner.y;
      if (corner.x > maxX) maxX = corner.x;
      if (corner.y > maxY) maxY = corner.y;
    }
  }

  return { worldWidth: maxX, worldHeight: maxY, minX, minY };
}
