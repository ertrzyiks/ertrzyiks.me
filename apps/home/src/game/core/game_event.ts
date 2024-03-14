import type { Player } from "./player";
import { Unit } from "./units";
import type { CubeCoordinates } from "honeycomb-grid";

export enum GameEventType {
  GameStart,
  GameEnd,
  PlayerJoin,
  StartTurn,
  EndTurn,
  Spawn,
  Move,
  TakeDamage,
  Reset,
}

export interface AbstractEvent {
  type: GameEventType;
}

export interface GameStartEvent extends AbstractEvent {
  type: GameEventType.GameStart;
}

export interface GameEndEvent extends AbstractEvent {
  type: GameEventType.GameEnd;
}

export interface SpawnEvent extends AbstractEvent {
  type: GameEventType.Spawn;
  owner: Player;
  position: CubeCoordinates;
  unit: Unit;
}

export interface ResetEvent extends AbstractEvent {
  type: GameEventType.Reset;
}

export interface PlayerJoinEvent extends AbstractEvent {
  type: GameEventType.PlayerJoin;
  player: Player;
}

export interface StartTurnEvent extends AbstractEvent {
  type: GameEventType.StartTurn;
}

export interface EndTurnEvent extends AbstractEvent {
  type: GameEventType.EndTurn;
}

export interface MoveEvent extends AbstractEvent {
  type: GameEventType.Move;
  unit: Unit;
  position: CubeCoordinates;
}

export interface TakeDamageEvent extends AbstractEvent {
  type: GameEventType.TakeDamage;
  target: Unit;
  inflictor: Unit;
  damage: number;
}

export type SystemEvent =
  | GameStartEvent
  | GameEndEvent
  | SpawnEvent
  | ResetEvent;
export type GameEvent =
  | SystemEvent
  | PlayerJoinEvent
  | StartTurnEvent
  | EndTurnEvent
  | MoveEvent
  | TakeDamageEvent;
