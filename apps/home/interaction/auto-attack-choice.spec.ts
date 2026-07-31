import { test, expect } from "@playwright/test";

// docs/adr/0001 + docs/adr/0004: proves the ambiguous case doesn't
// auto-resolve. Landing next to 2 eligible enemies at once must leave both
// alive and wait for the player's own click on one of them (the existing
// manual click-to-attack path) rather than guessing.
test("moving next to 2 eligible enemies does not auto-attack, and a manual click resolves only the clicked one", async ({
  page,
}) => {
  await page.goto("/interaction-harness?enemy=2");

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_start");
  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_enemy_spot")))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_enemy_spot_2")))
    .toBe(true);

  const start = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_start")
  );
  const next = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_next")
  );
  const enemySpot = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_enemy_spot")
  );
  if (!start || !next || !enemySpot) throw new Error("harness tiles not found on screen");

  await page.mouse.click(start.x, start.y); // select the Hero
  await page.mouse.click(next.x, next.y); // adjacent to both enemy spots

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_next");
  // The store position updates synchronously on Move, well before
  // handleTileClick's post-move auto-attack decision (awaited past the move's
  // own animation) actually runs — give it time to settle before asserting
  // that neither enemy was auto-attacked.
  await page.waitForTimeout(800);
  expect(
    await page.evaluate(() => window.__test?.isSectionOccupied("harness_enemy_spot"))
  ).toBe(true);
  expect(
    await page.evaluate(() => window.__test?.isSectionOccupied("harness_enemy_spot_2"))
  ).toBe(true);

  await page.mouse.click(enemySpot.x, enemySpot.y); // manually attack this one

  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_enemy_spot")))
    .toBe(false);
  // The other one was left untouched.
  expect(
    await page.evaluate(() => window.__test?.isSectionOccupied("harness_enemy_spot_2"))
  ).toBe(true);
});
