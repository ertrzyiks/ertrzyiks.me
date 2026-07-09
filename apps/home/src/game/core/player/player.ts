export enum PlayerColor {
  BLUE,
  RED,
  GREEN
}

export interface Player {
  id: string
  name: string
  color: PlayerColor
}
