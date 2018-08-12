export function getGridBoundingBox(grid) {
  const lastHex = grid.get(grid.length - 1)
  const lastPoint = lastHex.toPoint()
  const lastCorners = lastHex.corners()
  const worldWidth = lastPoint.x + Math.max.apply(Math, lastCorners.map(c => c.x))
  const worldHeight = lastPoint.y + Math.max.apply(Math, lastCorners.map(c => c.y))

  return {worldWidth, worldHeight}
}
