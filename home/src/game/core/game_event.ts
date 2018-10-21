import {Player} from './player'
import {Unit} from './units'
import {CubeCoordinates} from 'honeycomb-grid'

export enum GameEventType {
  GameStart,
  GameEnd,
  PlayerJoin,
  TurnStart,
  TurnEnd,
  Spawn,
  Move,
  TakeDamage,
  Reset
}

export interface AbstractEvent {
  type: GameEventType
}

export interface AbstractEventWithPlayer {
  player: Player
}

export interface GameStartEvent extends AbstractEvent {
  type: GameEventType.GameStart
}

export interface GameEndEvent extends AbstractEvent {
  type: GameEventType.GameEnd
}

export interface SpawnEvent extends AbstractEvent {
  type: GameEventType.Spawn,
  owner: Player,
  position: CubeCoordinates,
  unit: Unit
}

export interface ResetEvent extends AbstractEvent {
  type: GameEventType.Reset
}

export interface PlayerJoinEvent extends AbstractEventWithPlayer {
  type: GameEventType.PlayerJoin
}

export interface TurnStartEvent extends AbstractEventWithPlayer {
  type: GameEventType.TurnStart
}

export interface TurnEndEvent extends AbstractEventWithPlayer {
  type: GameEventType.TurnEnd
}

export interface MoveEvent extends AbstractEventWithPlayer {
  type: GameEventType.Move,
  unit: Unit,
  position: CubeCoordinates
}

export interface TakeDamageEvent extends AbstractEventWithPlayer {
  type: GameEventType.TakeDamage,
  target: Unit,
  inflictor: Unit,
  damage: number
}

export type SystemEvent = GameStartEvent | GameEndEvent | SpawnEvent | ResetEvent
export type GameEvent = SystemEvent | PlayerJoinEvent | TurnStartEvent | TurnEndEvent | MoveEvent | TakeDamageEvent
