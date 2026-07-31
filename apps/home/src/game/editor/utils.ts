import type { GameTileHex } from "../core";

// Callers always pass the live grid's Honeycomb hexes (State.tiles), never
// plain board data — x/y here are offset coordinates, matching a hex's
// `col`/`row` (not its pixel `x`/`y`).
export function getTile(tiles: Array<GameTileHex>, x: number, y: number) {
  const found = tiles.filter((tile) => tile.col === x && tile.row === y);

  if (found.length > 0) {
    return found[0];
  }
}
