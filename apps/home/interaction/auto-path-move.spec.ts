import { test, expect } from "@playwright/test";

// docs/adr/0001 + docs/adr/0003: drives the real PixiJS pointertap ->
// handleTileClick path with actual pixel clicks, proving a single click 2+
// hexes away actually walks the unit there in one action (not just that the
// underlying moveRange()/pathTo() functions are correct in isolation —
// scenario.test.ts and movement.test.ts never touch the click handler at
// all).
test("clicking a hex 2 steps away auto-paths the unit there in one click", async ({
  page,
}) => {
  await page.goto("/interaction-harness");

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_start");

  const start = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_start")
  );
  const far = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_far")
  );
  if (!start || !far) throw new Error("harness tiles not found on screen");

  await page.mouse.click(start.x, start.y); // select the friendly unit
  await page.mouse.click(far.x, far.y); // 2 hexes away, within the Hero's budget of 3

  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_far");
});
