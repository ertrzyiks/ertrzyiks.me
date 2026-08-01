import { test, expect } from "@playwright/test";

// spec 03 "Click on an Enemy Unit" + issue #219: a bare click-to-attack (no
// preceding move) on an enemy already adjacent to the selected unit must
// resolve immediately.
test("selecting a unit then clicking an already-adjacent enemy attacks it directly", async ({
  page,
}) => {
  await page.goto("/interaction-harness?enemy=adjacent");

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_start");
  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_adjacent_enemy_spot")))
    .toBe(true);

  const start = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_start")
  );
  const enemySpot = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_adjacent_enemy_spot")
  );
  if (!start || !enemySpot) throw new Error("harness tiles not found on screen");

  await page.mouse.click(start.x, start.y); // select the Hero
  await page.mouse.click(enemySpot.x, enemySpot.y); // attack the adjacent enemy directly

  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_adjacent_enemy_spot")))
    .toBe(false);
  // The Hero never had to move to land this attack.
  expect(
    await page.evaluate(() => window.__test?.getUnitSectionByOwner("human"))
  ).toBe("harness_start");
});

// spec 03 "Click on an Enemy Unit" + issue #219: clicking an enemy that
// isn't adjacent yet, but that the selected unit can still reach (a hex next
// to it lies within move range) and attack this turn, auto-paths the unit
// there and resolves the attack in the same click — the player already
// declared which enemy they want by clicking it.
test("clicking a reachable-but-not-adjacent enemy auto-paths next to it and attacks it", async ({
  page,
}) => {
  await page.goto("/interaction-harness?enemy=1");

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_start");
  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_enemy_spot")))
    .toBe(true);

  const start = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_start")
  );
  const enemySpot = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_enemy_spot")
  );
  if (!start || !enemySpot) throw new Error("harness tiles not found on screen");

  await page.mouse.click(start.x, start.y); // select the Hero
  await page.mouse.click(enemySpot.x, enemySpot.y); // click the enemy directly (2 hexes away)

  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_enemy_spot")))
    .toBe(false);
  // The Hero walked to the nearest hex adjacent to the enemy to land the hit.
  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_next");
});
