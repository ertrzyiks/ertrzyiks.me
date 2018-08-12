import * as Honeycomb from 'honeycomb-grid'

export function createGrid() {
  const Hex = Honeycomb.extendHex({size: 46, orientation: 'flat'})
  return Honeycomb.defineGrid(Hex)
}
