import { PlayerColor, type Player } from "../../core/player/player";
import { createPackMemory } from "../../core/player/pack_behavior";
import type { StageDefinition, UnitSpawn, EnemyRoster } from "../stages/stage";
import {
  createUnitFromCatalog,
  createBehaviorFromCatalog,
  createPlayerFromCatalog,
} from "./catalog";
import type { RosterSpawnData, StageRosterData } from "./stage_roster";

/**
 * Every hand-written `createStage{1,2,3}Definition` uses this exact identity
 * for the human player — no user story asks to customize it, so it is fixed
 * here rather than made part of `StageRosterData`.
 */
const HUMAN_PLAYER: Player = { id: "human", name: "Adventurer", color: PlayerColor.BLUE };

function resolveSpawns(spawns: RosterSpawnData[]): UnitSpawn[] {
  return spawns.map((spawn) => ({
    section: spawn.section,
    createUnit: () => createUnitFromCatalog(spawn.unitKey),
  }));
}

/**
 * Turns editor-authored `StageRosterData` (section names + catalog keys) into
 * the same `StageDefinition` shape `Scenario`/`Game` already consume from the
 * hand-written `createStage{1,2,3}Definition` factories (issue #170
 * "Resolver" / user story 19: "indistinguishable from today's hand-written
 * ones"). A factory, matching those functions' shape: called once per stage
 * load, producing fresh `Player` objects and a fresh `PackMemory` per enemy
 * roster so a `Pack` behavior's no-backtrack memory holds across that
 * roster's turns without leaking into the next stage load — the same
 * lifecycle `createStage1Definition` gets by declaring `packMemory` outside
 * its returned `createBehavior` closure.
 *
 * Does not validate that section names exist on any particular board, or
 * that no two spawns share a section — issue #170 makes that the editor's
 * save-time job (Implementation Decisions "Validation"), not the resolver's;
 * this function is a pure data transform, same as the hand-written factories
 * it replaces, which have never validated either.
 */
export function resolveStageDefinition(data: StageRosterData): StageDefinition {
  // A fresh copy each call, matching how createStage{1,2,3}Definition build
  // a new Player object per call rather than sharing one mutable identity.
  const player = { ...HUMAN_PLAYER };

  const enemies: EnemyRoster[] = data.enemies.map((enemy) => {
    const rosterPlayer = createPlayerFromCatalog(enemy.factionKey);
    const packMemory = createPackMemory();

    return {
      player: rosterPlayer,
      spawns: resolveSpawns(enemy.spawns),
      turnEventName: enemy.turnEventName,
      createBehavior: (store) =>
        createBehaviorFromCatalog(enemy.behaviorKey, store, {
          targetPlayerId: player.id,
          packMemory,
        }),
    };
  });

  return {
    player,
    playerSpawns: resolveSpawns(data.playerSpawns),
    enemies,
    winSection: data.winSection,
  };
}
