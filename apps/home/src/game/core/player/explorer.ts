import type { CubeCoordinates } from "honeycomb-grid";
import { Direction, directions, opposite } from "../direction";
import { PlayerActionType } from "../player_action";
import { positionAt, cubeToCartesian } from "../grid";
import { isMovable, type IMovable } from "../units";
import { Behavior } from "./behavior";

export class Explorer extends Behavior {
  protected lastDirection: { [id: number]: Direction } = {};

  takeActions() {
    this.store.getState().units.forEach((u) => {
      if (isMovable(u.unit)) {
        this.exploreWith(u.unit);
      }
    });

    this.store.dispatch({ type: PlayerActionType.EndTurn });
  }

  protected exploreWith(unit: IMovable) {
    const unitPosition = this.store
      .getState()
      .units.filter((u) => u.unit === unit)[0];
    const pos = unitPosition.position;
    this.lastDirection[unit.id] = this.randomDirection(
      this.lastDirection[unit.id],
      pos
    );

    this.store.dispatch({
      type: PlayerActionType.Move,
      unit: unit,
      direction: this.lastDirection[unit.id],
    });
  }

  protected randomDirection(
    previousDirection: Direction,
    position: CubeCoordinates
  ) {
    const except = opposite(previousDirection);
    let availableDirections = directions.filter((d) => d != except);

    const state = this.store.getState();
    const worldWidth = state.cols;
    const worldHeight = state.rows;

    const attempts = availableDirections.length;

    for (let i = 0; i < attempts; i++) {
      const randomDir = availableDirections.splice(
        Math.floor(Math.random() * availableDirections.length),
        1
      )[0];
      const newPos = positionAt(position, randomDir);
      const cartesianPos = cubeToCartesian(newPos);
      if (cartesianPos.x < 0 || cartesianPos.x >= worldWidth - 1) continue;
      if (cartesianPos.y < 0 || cartesianPos.y >= worldHeight - 1) continue;
      return randomDir;
    }

    return directions[Math.floor(Math.random() * directions.length)];
  }
}
