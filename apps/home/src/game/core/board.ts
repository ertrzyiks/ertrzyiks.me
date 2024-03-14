import type { CubeCoordinates, Hex } from "honeycomb-grid";
import { Unit } from "./units";

export enum Terrain {
  WATER = "water",
}

export interface GameTile {
  textureName: string;
  sectionName: string;
  type: Terrain;
}

export type GameTileHex = Hex<GameTile>;

export interface UnitPosition {
  unit: Unit;
  position: CubeCoordinates;
}

export interface BoardTile {
  readonly x: number;
  readonly y: number;
  readonly type: Terrain;
  readonly textureName: string;
  readonly sectionName: string;
}

export interface BoardTerrain extends BoardTile {
  readonly width?: number;
  readonly height?: number;
}

export interface Board {
  readonly rows: number;
  readonly cols: number;
  readonly tiles: Array<BoardTerrain>;
}
