import type { Grid } from "honeycomb-grid";
import type { GameTileHex } from "../board";

interface WorldDimensions {
  worldWidth: number;
  worldHeight: number;
}

export function getGridBoundingBox(grid: Grid<GameTileHex>): WorldDimensions {
  const lastHex = grid.toArray()[grid.size - 1];

  if (!lastHex) throw new Error("No hex found in grid");

  // honeycomb-grid v4's `corners` getter already returns absolute
  // (world-space) points — each one is the hex's own x/y plus a corner
  // offset (see the library's flat/pointy corner formulas) — not points
  // relative to the hex's origin the way v1's did. Adding `lastHex.toPoint()`
  // on top of that (as the v1-era version of this function did) double-counts
  // the hex's position, inflating the computed bounding box to roughly double
  // the grid's real size for any hex far from the origin — which is exactly
  // what silently broke MainWorld's camera centering (see main/game_world.ts).
  const lastCorners = lastHex.corners;
  const worldWidth = Math.max.apply(
    Math,
    lastCorners.map((c) => c.x)
  );
  const worldHeight = Math.max.apply(
    Math,
    lastCorners.map((c) => c.y)
  );

  return { worldWidth, worldHeight };
}
