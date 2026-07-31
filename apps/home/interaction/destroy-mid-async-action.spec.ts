import { test, expect } from "@playwright/test";

// docs/adr/0001 + issue #175: reproduces a crash reported as "Uncaught
// TypeError: Cannot read properties of undefined (reading 'updateRenderable')".
// Root cause: handleTileClick (main/game_world.ts) became async (ADR-0003's
// multi-step auto-path, ADR-0004's auto-attack highlight delay), so it can
// suspend on an `await` and resume *after* StageManager has already destroyed
// this MainWorld instance (on a stage win/loss — main/stage_manager.ts's
// onStageEnded). Resuming code that then touches Pixi objects throws inside
// PixiJS's internals, since destroyed Pixi objects no longer have the state
// their own render/update paths expect (confirmed by reverting the fix
// locally: this test then reliably fails with "Cannot read properties of
// null (reading 'x')" — the same class of bug, a destroyed object's property
// read by something that assumes it's still alive). This drives the real
// click -> auto-attack path, then destroys the world (via the harness's
// __debugWorld, standing in for StageManager) while the attack-highlight
// delay is still in flight, and asserts nothing throws.
test("destroying the world mid-await (during an in-flight auto-attack) does not throw", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/interaction-harness?enemy=1");

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

  await page.mouse.click(start.x, start.y); // select the Hero
  await page.mouse.click(next.x, next.y); // adjacent to the enemy -> auto-attack starts, 400ms highlight delay

  // Wait for the move's own tween to actually land (position updates
  // synchronously; the animation itself takes ~600ms) before destroying, so
  // we're inside the auto-attack's *own* highlight delay, not still stuck in
  // the move's wait.
  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_next");
  await page.waitForTimeout(700);

  // destroyWorld() calls destroy({ children: true }), matching main/stage_manager.ts's
  // own destroy call — the default (no options) doesn't cascade to children
  // at all, so highlightContainer would stay untouched and never reproduce this.
  await page.evaluate(() => window.__test!.destroyWorld());

  // Give the suspended handleTileClick time to resume past the delay and
  // hit every isDestroyed check.
  await page.waitForTimeout(1000);

  expect(pageErrors).toEqual([]);
});
