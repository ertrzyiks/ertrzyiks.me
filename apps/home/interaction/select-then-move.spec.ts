import { test, expect } from "@playwright/test";

// docs/adr/0001: drives the real PixiJS pointertap -> handleTileClick path
// with actual pixel clicks (not synthetic event injection), so a hit-testing
// or wiring regression here fails the way it actually failed in the browser
// — unlike scenario.test.ts, which dispatches store actions directly and
// never touches this code path at all.
test("clicking the friendly unit then an adjacent empty hex moves it there", async ({
  page,
}) => {
  await page.goto("/interaction-harness");

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
  await page.mouse.click(next.x, next.y); // move it to the adjacent hex

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_next");
});
