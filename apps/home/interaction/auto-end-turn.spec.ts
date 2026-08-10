import { test, expect } from "@playwright/test";

// spec 03 "Auto End Turn" / issue #329: once every one of the human's units
// has spent both its move and attack budget, the turn ends on its own — no
// click on the End Turn button required. Draining the Hero's only unit via a
// bare click-to-attack (TakeDamage's reducer case forces the attacker's
// remaining movement to 0 as well as spending its attack charge — see
// core/reducers/index.ts) is the smallest action that leaves the roster
// fully drained. `getTurn()` (the StartTurn counter) advancing past its
// starting value is the plain-data signal that a new turn actually began —
// the harness's stationary enemy behavior ends its own turn immediately, so
// this also proves control passed to it and cycled back, not just that some
// client-side flag flipped.
test("draining the only unit's move and attack budget ends the turn automatically", async ({
  page,
}) => {
  await page.goto("/interaction-harness?enemy=adjacent");

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_start");
  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_adjacent_enemy_spot")))
    .toBe(true);
  const startingTurn = await page.evaluate(() => window.__test!.getTurn());

  const start = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_start")
  );
  const enemySpot = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_adjacent_enemy_spot")
  );
  if (!start || !enemySpot) throw new Error("harness tiles not found on screen");

  await page.mouse.click(start.x, start.y); // select the Hero
  await page.mouse.click(enemySpot.x, enemySpot.y); // attack — its only action this turn

  // The attack landed (drained the roster) ...
  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_adjacent_enemy_spot")))
    .toBe(false);
  // ... and a new turn started without an End Turn click.
  await expect
    .poll(() => page.evaluate(() => window.__test!.getTurn()))
    .toBeGreaterThan(startingTurn);
});

// Counterpart to the above: a unit that still has budget left must not end
// the turn on its own, however far it moved — otherwise the "drained" check
// would be trivially true after any action at all.
test("a unit with movement left does not end the turn automatically", async ({
  page,
}) => {
  await page.goto("/interaction-harness");

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_start");
  const startingTurn = await page.evaluate(() => window.__test!.getTurn());

  const start = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_start")
  );
  const next = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_next")
  );
  if (!start || !next) throw new Error("harness tiles not found on screen");

  await page.mouse.click(start.x, start.y); // select the Hero
  await page.mouse.click(next.x, next.y); // spend 1 of 3 movement points

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_next");
  // Give any (incorrect) auto-end-turn a moment to fire before asserting it didn't.
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__test!.getTurn())).toBe(startingTurn);
});
