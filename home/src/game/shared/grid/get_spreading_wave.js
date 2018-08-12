function pointsBetween(cube1, cube2) {
  const dr = cube2.r - cube1.r
  const dq = cube2.q - cube1.q
  const ds = cube2.s - cube1.s

  const steps = Math.max(...[Math.abs(dr), Math.abs(dq), Math.abs(ds)])
  const points = []

  for (let i = 1; i < steps; i++) {
    points.push({
      r: cube1.r + i * (dr / steps),
      q: cube1.q + i * (dq / steps),
      s: cube1.s + i * (ds / steps)
    })
  }

  return points
}

export function getNextSpreadingWave(startCube, number, cubeToCartesian) {
  const corners = [
    {r: startCube.r + number, q: startCube.q - number, s: startCube.s}, // [0] +-0
    {r: startCube.r - number, q: startCube.q + number, s: startCube.s}, // [1] -+0
    {r: startCube.r + number, q: startCube.q, s: startCube.s - number}, // [2] +0-
    {r: startCube.r - number, q: startCube.q, s: startCube.s + number}, // [3] -0+
    {r: startCube.r, q: startCube.q + number, s: startCube.s - number}, // [4] 0+-
    {r: startCube.r, q: startCube.q - number, s: startCube.s + number}  // [5] 0-+
  ]

  return corners
    .concat()
    .concat(pointsBetween(corners[5], corners[0]))
    .concat(pointsBetween(corners[0], corners[2]))
    .concat(pointsBetween(corners[2], corners[4]))
    .concat(pointsBetween(corners[4], corners[1]))
    .concat(pointsBetween(corners[1], corners[3]))
    .concat(pointsBetween(corners[3], corners[5]))
    .map(cube => {
      if (!cube) return null;

      const point = cubeToCartesian(cube)
      if (point.x < 0 || point.y < 0) return null
      return point
    })
    .filter(cube => cube != null)
}
