import type { Grid, Hex } from "honeycomb-grid";

interface WorldDimensions {
  worldWidth: number;
  worldHeight: number;
}

export function getGridBoundingBox(grid: Grid<Hex<any>>): WorldDimensions {
  const lastHex = grid.get(grid.length - 1);

  if (!lastHex) throw new Error("No hex found in grid");

  const lastPoint = lastHex.toPoint();
  const lastCorners = lastHex.corners();
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
