import type { UnitKey, BehaviorKey, FactionKey } from "./catalog";

export interface RosterSpawnData {
  section: string;
  unitKey: UnitKey;
}

export interface EnemyRosterData {
  factionKey: FactionKey;
  spawns: RosterSpawnData[];
  behaviorKey: BehaviorKey;
  turnEventName: string;
}

/**
 * The stage-authoring data an editor session saves to disk (issue #170
 * "Stage-roster data shape"): references board sections by name string, same
 * as the hand-written `StageDefinition`/`UnitSpawn` shape, but with
 * `unitKey`/`behaviorKey`/`factionKey` catalog references in place of live
 * `createUnit`/`createBehavior` functions. Deliberately excludes the human
 * player's own identity and the board itself, for the same reasons
 * `StageDefinition` does (see `../stages/stage.ts`) — the human player is
 * fixed (see `resolveStageDefinition`), and board selection happens one
 * layer up.
 */
export interface StageRosterData {
  playerSpawns: RosterSpawnData[];
  enemies: EnemyRosterData[];
  winSection: string;
}
