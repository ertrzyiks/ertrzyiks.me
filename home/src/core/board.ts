import {Hex} from 'honeycomb-grid'

export enum Terrain {
  WATER = 'water'
}

export interface GameTile {
  terrain: Terrain
}

export type GameTileHex = Hex<GameTile>

export interface BoardTerrain {
  readonly x: number,
  readonly y: number,
  readonly width?: number,
  readonly height?: number,
  readonly type: Terrain
}

export interface Board {
  readonly rows: number,
  readonly cols: number,
  readonly tile_size: number,
  readonly terrain: Array<BoardTerrain>
}
