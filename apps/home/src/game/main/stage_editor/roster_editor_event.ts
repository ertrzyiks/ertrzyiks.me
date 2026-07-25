import type { UnitKey, BehaviorKey, FactionKey } from "./catalog";

export enum RosterEditorEventType {
  AddPlayerSpawn,
  RemovePlayerSpawn,
  AddEnemyRoster,
  RemoveEnemyRoster,
  AddEnemyRosterSpawn,
  RemoveEnemyRosterSpawn,
  SetWinSection,
}

export interface AbstractEvent {
  type: RosterEditorEventType;
}

export interface AddPlayerSpawnEvent extends AbstractEvent {
  type: RosterEditorEventType.AddPlayerSpawn;
  section: string;
  unitKey: UnitKey;
}

export interface RemovePlayerSpawnEvent extends AbstractEvent {
  type: RosterEditorEventType.RemovePlayerSpawn;
  index: number;
}

export interface AddEnemyRosterEvent extends AbstractEvent {
  type: RosterEditorEventType.AddEnemyRoster;
  factionKey: FactionKey;
  behaviorKey: BehaviorKey;
  turnEventName: string;
}

export interface RemoveEnemyRosterEvent extends AbstractEvent {
  type: RosterEditorEventType.RemoveEnemyRoster;
  rosterIndex: number;
}

export interface AddEnemyRosterSpawnEvent extends AbstractEvent {
  type: RosterEditorEventType.AddEnemyRosterSpawn;
  rosterIndex: number;
  section: string;
  unitKey: UnitKey;
}

export interface RemoveEnemyRosterSpawnEvent extends AbstractEvent {
  type: RosterEditorEventType.RemoveEnemyRosterSpawn;
  rosterIndex: number;
  spawnIndex: number;
}

export interface SetWinSectionEvent extends AbstractEvent {
  type: RosterEditorEventType.SetWinSection;
  section: string;
}

export type RosterEditorEvent =
  | AddPlayerSpawnEvent
  | RemovePlayerSpawnEvent
  | AddEnemyRosterEvent
  | RemoveEnemyRosterEvent
  | AddEnemyRosterSpawnEvent
  | RemoveEnemyRosterSpawnEvent
  | SetWinSectionEvent;
