import { test, expect } from "@playwright/test";

// docs/adr/0001 + docs/adr/0004: drives the real PixiJS pointertap ->
// handleTileClick path with actual pixel clicks, proving a move that lands
// the Hero adjacent to exactly one eligible enemy attacks it automatically —
// no separate click on the enemy required. The harness enemy has exactly
// enough HP to die in one hit (see createHarnessDefinitionWithEnemy), so
// "the enemy is gone" is an unambiguous signal the auto-attack actually fired
// (not just that the move succeeded).
test("moving next to a single eligible enemy attacks it automatically", async ({
  page,
}) => {
  await page.goto("/interaction-harness?enemy=1");

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_start");
  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("harness_enemy")))
    .toBe("harness_enemy_spot");

  const start = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_start")
  );
  const next = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_next")
  );
  if (!start || !next) throw new Error("harness tiles not found on screen");

  await page.mouse.click(start.x, start.y); // select the Hero
  await page.mouse.click(next.x, next.y); // adjacent to harness_enemy_spot

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_next");
  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("harness_enemy")))
    .toBeNull();
});
