import type { CubeCoordinates } from "honeycomb-grid";
import { Unit } from "./units";

export enum PlayerActionType {
  EndTurn,
  ResetTurn,
  UndoLast,
  Move,
  Attack,
}

interface AbstractAction {
  type: PlayerActionType;
}

export interface EndTurnAction extends AbstractAction {
  type: PlayerActionType.EndTurn;
}

export interface UndoLastAction extends AbstractAction {
  type: PlayerActionType.UndoLast;
}

export interface ResetTurnAction extends AbstractAction {
  type: PlayerActionType.ResetTurn;
}

export interface MoveAction extends AbstractAction {
  type: PlayerActionType.Move;
  unit: Unit;
  direction: string;
}

export interface AttackAction extends AbstractAction {
  type: PlayerActionType.Attack;
  position: CubeCoordinates;
}

export type PlayerAction =
  | EndTurnAction
  | UndoLastAction
  | ResetTurnAction
  | MoveAction
  | AttackAction;
