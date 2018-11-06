import {Hex} from 'honeycomb-grid'

export enum Terrain {
  WATER = 'water'
}

export interface GameTile {
  textureName: string
}

export type GameTileHex = Hex<GameTile>

export interface BoardTerrain {
  readonly x: number,
  readonly y: number,
  readonly width?: number,
  readonly height?: number,
  readonly type: Terrain
  readonly textureName: string
}

export interface Board {
  readonly rows: number,
  readonly cols: number,
  readonly tiles: Array<BoardTerrain>
}
