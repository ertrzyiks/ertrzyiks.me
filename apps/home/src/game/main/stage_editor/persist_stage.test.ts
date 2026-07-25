import { describe, expect, test, afterEach } from "vitest";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Terrain, type Board } from "../../core/board";
import type { StageRosterData } from "./stage_roster";
import { isValidStageName, loadStageFiles, saveStageFiles } from "./persist_stage";

const board: Board = {
  rows: 1,
  cols: 1,
  tiles: [{ x: 0, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "spawn_a" }],
};

const stageRoster: StageRosterData = {
  playerSpawns: [{ section: "spawn_a", unitKey: "Hero" }],
  enemies: [],
  winSection: "spawn_a",
};

describe("isValidStageName", () => {
  test.each(["stage1", "the_gate-2", "A1"])("accepts %s", (name) => {
    expect(isValidStageName(name)).toBe(true);
  });

  // Every one of these would land outside a target directory, or overwrite
  // an unrelated file, if it reached saveStageFiles unchecked.
  test.each([
    ["empty string", ""],
    ["path traversal", "../../etc/passwd"],
    ["nested path", "sub/dir"],
    ["dot only", "."],
    ["absolute path", "/etc/passwd"],
    ["null byte", "stage1\0"],
    ["space", "stage 1"],
  ])("rejects %s", (_label, name) => {
    expect(isValidStageName(name)).toBe(false);
  });
});

describe("saveStageFiles", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test("writes the board and stage-roster files to their target directories", async () => {
    dir = await mkdtemp(join(tmpdir(), "stage-editor-save-"));
    const boardsDir = join(dir, "boards");
    const stagesDir = join(dir, "stages");
    await Promise.all([mkdir(boardsDir), mkdir(stagesDir)]);

    await saveStageFiles("forest", board, stageRoster, { boardsDir, stagesDir });

    const savedBoard = JSON.parse(await readFile(join(boardsDir, "forest.json"), "utf-8"));
    const savedRoster = JSON.parse(
      await readFile(join(stagesDir, "forest.stage-roster.json"), "utf-8")
    );
    expect(savedBoard).toEqual(board);
    expect(savedRoster).toEqual(stageRoster);
  });

  test("rejects an invalid stage name before writing anything", async () => {
    dir = await mkdtemp(join(tmpdir(), "stage-editor-save-"));
    const boardsDir = join(dir, "boards");
    const stagesDir = join(dir, "stages");
    await Promise.all([mkdir(boardsDir), mkdir(stagesDir)]);

    await expect(
      saveStageFiles("../escape", board, stageRoster, { boardsDir, stagesDir })
    ).rejects.toThrow(/invalid stage name/i);

    expect(await readdir(boardsDir)).toEqual([]);
    expect(await readdir(stagesDir)).toEqual([]);
  });

  test("refuses to overwrite a name with a hand-written <name>.ts factory", async () => {
    dir = await mkdtemp(join(tmpdir(), "stage-editor-save-"));
    const boardsDir = join(dir, "boards");
    const stagesDir = join(dir, "stages");
    await Promise.all([mkdir(boardsDir), mkdir(stagesDir)]);
    await writeFile(join(stagesDir, "stage1.ts"), "export function createStage1Definition() {}");

    await expect(
      saveStageFiles("stage1", board, stageRoster, { boardsDir, stagesDir })
    ).rejects.toThrow(/already exists — refusing to overwrite/i);

    expect(await readdir(boardsDir)).toEqual([]);
  });

  test("allows re-saving a name with no hand-written factory, even if a prior editor save exists", async () => {
    dir = await mkdtemp(join(tmpdir(), "stage-editor-save-"));
    const boardsDir = join(dir, "boards");
    const stagesDir = join(dir, "stages");
    await Promise.all([mkdir(boardsDir), mkdir(stagesDir)]);

    await saveStageFiles("forest", board, stageRoster, { boardsDir, stagesDir });
    const updatedRoster = { ...stageRoster, winSection: "somewhere_else" };
    await saveStageFiles("forest", board, updatedRoster, { boardsDir, stagesDir });

    const savedRoster = JSON.parse(
      await readFile(join(stagesDir, "forest.stage-roster.json"), "utf-8")
    );
    expect(savedRoster).toEqual(updatedRoster);
  });
});

describe("loadStageFiles", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test("reads back exactly what saveStageFiles wrote", async () => {
    dir = await mkdtemp(join(tmpdir(), "stage-editor-load-"));
    const boardsDir = join(dir, "boards");
    const stagesDir = join(dir, "stages");
    await Promise.all([mkdir(boardsDir), mkdir(stagesDir)]);

    await saveStageFiles("forest", board, stageRoster, { boardsDir, stagesDir });
    const loaded = await loadStageFiles("forest", { boardsDir, stagesDir });

    expect(loaded).toEqual({ board, stageRoster });
  });

  test("rejects an invalid stage name before touching the filesystem", async () => {
    dir = await mkdtemp(join(tmpdir(), "stage-editor-load-"));
    const boardsDir = join(dir, "boards");
    const stagesDir = join(dir, "stages");
    await Promise.all([mkdir(boardsDir), mkdir(stagesDir)]);

    await expect(loadStageFiles("../escape", { boardsDir, stagesDir })).rejects.toThrow(
      /invalid stage name/i
    );
  });

  test("errors clearly when no saved stage exists with that name", async () => {
    dir = await mkdtemp(join(tmpdir(), "stage-editor-load-"));
    const boardsDir = join(dir, "boards");
    const stagesDir = join(dir, "stages");
    await Promise.all([mkdir(boardsDir), mkdir(stagesDir)]);

    await expect(loadStageFiles("nonexistent", { boardsDir, stagesDir })).rejects.toThrow(
      /no saved stage named "nonexistent"/i
    );
  });
});
