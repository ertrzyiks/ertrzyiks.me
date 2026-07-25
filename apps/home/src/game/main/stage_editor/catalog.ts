import type { Unit } from "../../core/units";
import { Behavior } from "../../core/player/behavior";
import { PackBehavior, type PackMemory } from "../../core/player/pack_behavior";
import { FleeBehavior } from "../../core/player/flee_behavior";
import { SeekerBehavior } from "../../core/player/seeker_behavior";
import { PlayerColor, type Player } from "../../core/player/player";
import type { StoreProxy } from "../../core/store";
import type { GameEvent } from "../../core/game_event";
import type { State } from "../../core/world";
import type { PlayerAction } from "../../core/player_action";
import { Hero, PackLeader, PackFollower, Wanderer, Bandit, BanditCaptain } from "../units";

type GameStoreProxy = StoreProxy<GameEvent, State, PlayerAction>;

/**
 * Fixed set of unit types an editor-authored roster can spawn (issue #170
 * "no plugin/registration mechanism for new types — a genuinely new unit
 * still requires a code change"). Covers every unit `main/stages/stage{1,2,3}`
 * hand-write today, except "Wolf": this codebase has no standalone Wolf unit,
 * only the pack's Leader/Follower roles, so those two stand in for it.
 */
export const UNIT_CATALOG = {
  Hero: () => new Hero(),
  PackLeader: () => new PackLeader(),
  PackFollower: () => new PackFollower(),
  Wanderer: () => new Wanderer(),
  Bandit: () => new Bandit(),
  BanditCaptain: () => new BanditCaptain(),
} as const satisfies Record<string, () => Unit>;

export type UnitKey = keyof typeof UNIT_CATALOG;

export function createUnitFromCatalog(key: UnitKey): Unit {
  return UNIT_CATALOG[key]();
}

export function isUnitKey(value: string): value is UnitKey {
  return value in UNIT_CATALOG;
}

/**
 * What a behavior factory needs to build a live `Behavior`. `targetPlayerId`
 * is always the stage's human player id — Flee/Seeker only ever flee-from or
 * hunt-for the human player in this game (issue #170 user story 11), so a
 * resolver hardcodes it rather than exposing general multi-player targeting.
 * `packMemory` must be created once per stage load and threaded into every
 * PackBehavior instance across that roster's turns (its no-backtrack rule
 * holds across turns, not per turn — see `createStage1Definition`), so the
 * resolver owns creating it, not this catalog.
 */
export interface BehaviorContext {
  targetPlayerId: string;
  packMemory: PackMemory;
}

type BehaviorFactory = (store: GameStoreProxy, ctx: BehaviorContext) => Behavior;

export const BEHAVIOR_CATALOG = {
  Pack: (store, ctx) => new PackBehavior(store, ctx.packMemory),
  Flee: (store, ctx) => new FleeBehavior(store, { fleeFrom: [ctx.targetPlayerId] }),
  Seeker: (store, ctx) => new SeekerBehavior(store, { huntFor: [ctx.targetPlayerId] }),
} as const satisfies Record<string, BehaviorFactory>;

export type BehaviorKey = keyof typeof BEHAVIOR_CATALOG;

export function createBehaviorFromCatalog(
  key: BehaviorKey,
  store: GameStoreProxy,
  ctx: BehaviorContext
): Behavior {
  return BEHAVIOR_CATALOG[key](store, ctx);
}

export function isBehaviorKey(value: string): value is BehaviorKey {
  return value in BEHAVIOR_CATALOG;
}

/**
 * Per-faction player identity (id, display name, color) — issue #170 user
 * story 7: derived from the roster's chosen faction instead of kept in sync
 * by hand. Matches the ids/names/colors `createStage{1,2,3}Definition`
 * already hand-write for each enemy roster today.
 */
export const FACTION_CATALOG = {
  wolves: { id: "wolves", name: "Pack", color: PlayerColor.RED },
  bandits: { id: "bandits", name: "Bandits", color: PlayerColor.RED },
  wanderer: { id: "wanderer", name: "Wanderer", color: PlayerColor.GREEN },
} as const satisfies Record<string, Player>;

export type FactionKey = keyof typeof FACTION_CATALOG;

/**
 * Returns a fresh copy, matching how `createStage{1,2,3}Definition` build a
 * new Player object per call — callers must not share one mutable identity
 * object across stage (re)loads.
 */
export function createPlayerFromCatalog(key: FactionKey): Player {
  return { ...FACTION_CATALOG[key] };
}

export function isFactionKey(value: string): value is FactionKey {
  return value in FACTION_CATALOG;
}
