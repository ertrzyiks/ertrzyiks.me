import {CubeCoordinates, PointLike, FlatCompassDirection, extendHex} from 'honeycomb-grid'
const Hex = extendHex({orientation: 'flat'})

const directionalOffset: {[direction: string]: CubeCoordinates} = {
  'sw': { r: 1, q: -1, s: 0 },
  's': { r: 1, q: 0, s: -1 },
  'n': { r: -1, q: 0, s: 1 },
  'ne': { r: -1, q: 1, s: 0 },
  'se': { r: 0, q: 1, s: -1 },
  'nw': { r: 0, q: -1, s: 1 }
}

export function cartesianToCube(point: PointLike) {
  return Hex().cartesianToCube(point)
}

export function cubeToCartesian(point: CubeCoordinates) {
  return Hex().cubeToCartesian(point)
}

export function positionAt(position: CubeCoordinates, direction: string) {
  const offset = directionalOffset[direction]
  return { r: position.r + offset.r, q: position.q + offset.q, s: position.s + offset.s }
}
