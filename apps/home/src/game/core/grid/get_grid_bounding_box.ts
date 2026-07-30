import type { Grid } from "honeycomb-grid";
import type { GameTileHex } from "../board";

interface WorldDimensions {
  worldWidth: number;
  worldHeight: number;
}

export function getGridBoundingBox(grid: Grid<GameTileHex>): WorldDimensions {
  const lastHex = grid.toArray()[grid.size - 1];

  if (!lastHex) throw new Error("No hex found in grid");

  const lastPoint = lastHex.toPoint();
  const lastCorners = lastHex.corners;
  const worldWidth =
    lastPoint.x +
    Math.max.apply(
      Math,
      lastCorners.map((c) => c.x)
    );
  const worldHeight =
    lastPoint.y +
    Math.max.apply(
      Math,
      lastCorners.map((c) => c.y)
    );

  return { worldWidth, worldHeight };
}
