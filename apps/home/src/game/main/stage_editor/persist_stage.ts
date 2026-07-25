import { access, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Board } from "../../core/board";
import type { StageRosterData } from "./stage_roster";

/**
 * Stage names become filenames on disk (issue #170 Save: "write a board file
 * and a stage-roster file straight to disk in dev"), so they're restricted
 * to a filename-safe charset. This is the only thing standing between a Save
 * request and path traversal (`../../etc/passwd`, an absolute path, etc.),
 * so it's checked before any path is built, not just for UX friendliness —
 * no character this excludes (`.`, `/`, `\`, null bytes, ...) can ever
 * appear in a validated name.
 */
const VALID_STAGE_NAME = /^[a-zA-Z0-9_-]+$/;

export function isValidStageName(name: string): boolean {
  return VALID_STAGE_NAME.test(name);
}

export interface SaveStageTarget {
  boardsDir: string;
  stagesDir: string;
}

const here = dirname(fileURLToPath(import.meta.url));

/** `main/boards/` and `main/stages/` — the same directories the hand-written board{1,2,3}.json / stage{1,2,3}.ts already live in. */
export const DEFAULT_SAVE_TARGET: SaveStageTarget = {
  boardsDir: join(here, "..", "boards"),
  stagesDir: join(here, "..", "stages"),
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes `<name>.json` (the board, same shape as board{1,2,3}.json) and
 * `<name>.stage-roster.json` (issue #170's new stage-roster data shape) to
 * `target`. The `.stage-roster.json` suffix keeps a saved stage from
 * colliding with a hand-written `<name>.ts` factory of the same name in
 * `stages/` (issue #170 Persistence: "alongside `src/game/main/stages/`").
 * Both writes run concurrently since neither depends on the other having
 * completed — a failed board write does not need the roster write rolled
 * back, or vice versa, since re-saving after fixing the error overwrites
 * both again.
 *
 * Refuses to save over a name that already has a hand-written `<name>.ts`
 * factory in `stagesDir` — unlike re-saving a stage the editor itself
 * created (which only ever touches `.json`/`.stage-roster.json` and is
 * meant to be overwritable, per user story 16 "reopen a previously saved
 * stage"), silently clobbering `stage1.ts`'s sibling `board1.json` with
 * editor output would destroy hand-authored content with no way back.
 */
export async function saveStageFiles(
  name: string,
  board: Board,
  stageRoster: StageRosterData,
  target: SaveStageTarget = DEFAULT_SAVE_TARGET
): Promise<void> {
  if (!isValidStageName(name)) {
    throw new Error(`Invalid stage name "${name}": use only letters, digits, "_", and "-"`);
  }

  if (await fileExists(join(target.stagesDir, `${name}.ts`))) {
    throw new Error(
      `A hand-written stage factory "${name}.ts" already exists — refusing to overwrite it. Choose a different stage name.`
    );
  }

  await Promise.all([
    writeFile(join(target.boardsDir, `${name}.json`), JSON.stringify(board, null, 2)),
    writeFile(
      join(target.stagesDir, `${name}.stage-roster.json`),
      JSON.stringify(stageRoster, null, 2)
    ),
  ]);
}

export interface LoadedStage {
  board: Board;
  stageRoster: StageRosterData;
}

/**
 * Reads back what `saveStageFiles` wrote (issue #170 user story 16: "reopen
 * a previously saved stage and see its board/spawns/rosters/win section
 * reflected in the editor"). `isValidStageName` is checked here too, not
 * just on save — an unchecked name reaching `join()` on a read path is
 * exactly as much a traversal risk (`../../.env`, `/etc/passwd`) as on a
 * write path.
 */
export async function loadStageFiles(
  name: string,
  target: SaveStageTarget = DEFAULT_SAVE_TARGET
): Promise<LoadedStage> {
  if (!isValidStageName(name)) {
    throw new Error(`Invalid stage name "${name}": use only letters, digits, "_", and "-"`);
  }

  const boardPath = join(target.boardsDir, `${name}.json`);
  const rosterPath = join(target.stagesDir, `${name}.stage-roster.json`);

  if (!(await fileExists(boardPath)) || !(await fileExists(rosterPath))) {
    throw new Error(`No saved stage named "${name}"`);
  }

  const [board, stageRoster] = await Promise.all([
    readFile(boardPath, "utf-8").then((raw) => JSON.parse(raw) as Board),
    readFile(rosterPath, "utf-8").then((raw) => JSON.parse(raw) as StageRosterData),
  ]);

  return { board, stageRoster };
}
