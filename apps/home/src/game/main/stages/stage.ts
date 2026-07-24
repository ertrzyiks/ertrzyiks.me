import type { Player } from "../../core/player/player";
import type { Unit } from "../../core/units";
import type { StoreProxy } from "../../core/store";
import type { GameEvent } from "../../core/game_event";
import type { State } from "../../core/world";
import type { PlayerAction } from "../../core/player_action";
import type { Behavior } from "../../core/player/behavior";

export interface UnitSpawn {
  section: string;
  createUnit: () => Unit;
}

/**
 * One CPU-controlled faction: who they are, what they spawn as, and how they
 * act on their turn. `turnEventName` is what Scenario emits when this
 * roster's turn starts — MainWorld listens for it to show turn-specific UI
 * (e.g. "wolfTurn" -> "Wolves' Turn"). Order within `StageDefinition.enemies`
 * is turn order (spec 06 "Action Resolution"): a faction that must act last
 * (e.g. the Wanderer) belongs at the end of the array.
 */
export interface EnemyRoster {
  player: Player;
  spawns: UnitSpawn[];
  turnEventName: string;
  createBehavior: (
    store: StoreProxy<GameEvent, State, PlayerAction>
  ) => Behavior;
}

/**
 * Everything Scenario needs to run a stage without hard-coding its content
 * (specs/08-stage-system.md: "the engine accepts a stage definition and
 * configures itself accordingly; it does not hard-code stage content").
 *
 * Deliberately does NOT include the board or the narrative script: board
 * selection happens one layer up, at `new Game(board)` construction (see
 * main/index.ts / GameWorld), and narrative is wired separately by MainWorld
 * (see main/narrative/*) — neither is consumed by Scenario itself, so adding
 * them here would be unused, speculative surface.
 */
export interface StageDefinition {
  player: Player;
  playerSpawns: UnitSpawn[];
  enemies: EnemyRoster[];
  winSection: string;
}
