export enum PlayerColor {
  BLUE,
  RED
}

export interface Player {
  id: string
  name: string
  color: PlayerColor
}
