export enum Direction {
  SW = "sw",
  S = "s",
  N = "n",
  NE = "ne",
  SE = "se",
  NW = "nw",
}

export const directions = Object.keys(Direction).map(
  //@ts-ignore
  (key) => Direction[key as any]
) as Direction[];

export function opposite(direction: Direction): Direction {
  switch (direction) {
    case Direction.N:
      return Direction.S;
    case Direction.S:
      return Direction.N;
    case Direction.NE:
      return Direction.SW;
    case Direction.SW:
      return Direction.NE;
    case Direction.NW:
      return Direction.SE;
    case Direction.SE:
      return Direction.NW;
  }
}
