import {extendHex, defineGrid} from 'honeycomb-grid'

export function createGrid() {
  const Hex = extendHex({size: 46, orientation: 'flat'})
  return defineGrid(Hex)
}
