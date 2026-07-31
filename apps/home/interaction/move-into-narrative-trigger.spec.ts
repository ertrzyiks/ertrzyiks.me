import { test, expect } from "@playwright/test";

// Regression test for a bug found while migrating to pixi.js v8 (unrelated to
// that migration itself — reproduces identically on any pixi version):
// Observable.push() (shared/observable.ts) notifies subscribers synchronously,
// so a move that steps onto a `tileReached` narrative section fires that
// beat's dialog *inside* the still-running moveUnit() call in
// handleTileClick (main/game_world.ts) — which used to read a
// `this.selectedUnit!` non-null assertion *after* that dispatch, even though
// the narrative dialog's handler had already set `this.selectedUnit = null`
// by then. `?narrative=1` opts the harness into a single tileReached beat on
// its own "harness_next" tile (see createHarnessNarrativeScript) so this is
// reproducible without mounting all of Stage 1's wolves/dialogs (docs/adr/0001
// explicitly rejects that as a general-purpose testing strategy).
test("moving into a tile that triggers a narrative beat does not throw", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/interaction-harness?narrative=1");

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_start");

  const start = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_start")
  );
  const next = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_next")
  );
  if (!start || !next) throw new Error("harness tiles not found on screen");

  await page.mouse.click(start.x, start.y); // select the friendly unit
  await page.mouse.click(next.x, next.y); // move onto the narrative-triggering hex

  // The move itself must still have gone through — a thrown exception mid
  // handleTileClick would otherwise leave this in a stale/undefined state
  // rather than just failing loudly.
  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_next");

  expect(pageErrors).toEqual([]);
});
