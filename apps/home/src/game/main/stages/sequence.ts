import type { Board } from "../../core/board";
import type { NarrativeScript } from "../../core/narrative";
import board1 from "../boards/board1.json";
import board2 from "../boards/board2.json";
import board3 from "../boards/board3.json";
import { createStage1Definition } from "./stage1";
import { createStage2Definition } from "./stage2";
import { createStage3Definition } from "./stage3";
import { createStage1Narrative } from "../narrative/stage1";
import { createStage2Narrative } from "../narrative/stage2";
import { createStage3Narrative } from "../narrative/stage3";
import type { StageDefinition } from "./stage";

export interface StageSequenceEntry {
  board: Board;
  createDefinition: () => StageDefinition;
  createNarrative: (humanId: string, wandererId: string) => NarrativeScript;
}

// Ordered 1 -> 2 -> 3 (specs/08-stage-system.md "Stages are ordered and
// numbered starting from 1"). Each entry pairs a stage's board with its
// existing definition/narrative factories — StageManager is the only
// consumer that turns this into a running MainWorld; this module stays pure
// data so it (and nextStageIndex below) can be unit-tested without Pixi.
export const STAGE_SEQUENCE: StageSequenceEntry[] = [
  {
    board: board1 as unknown as Board,
    createDefinition: createStage1Definition,
    createNarrative: createStage1Narrative,
  },
  {
    board: board2 as unknown as Board,
    createDefinition: createStage2Definition,
    createNarrative: createStage2Narrative,
  },
  {
    board: board3 as unknown as Board,
    createDefinition: createStage3Definition,
    createNarrative: createStage3Narrative,
  },
];

/**
 * The next stage's index in `STAGE_SEQUENCE`, or `null` once the final stage
 * is won (specs/08 "After the final stage is won, the game enters a
 * completed state and no further stages load").
 */
export function nextStageIndex(current: number): number | null {
  const next = current + 1;
  return next < STAGE_SEQUENCE.length ? next : null;
}
