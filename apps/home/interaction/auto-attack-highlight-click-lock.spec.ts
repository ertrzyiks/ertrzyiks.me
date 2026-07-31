import { test, expect } from "@playwright/test";

// Issue #178: a click landing inside the ~400ms pre-damage attack-highlight
// window (ADR-0004's ATTACK_HIGHLIGHT_DELAY_MS, shown via updateHighlights()
// in handleTileClick — main/game_world.ts) used to re-enter handleTileClick
// while the pending attackUnit() dispatch was still in flight, because
// isAutoPathing was already reset to false by the time the highlight delay
// started and canAcceptInput() had nothing left to check. This drives a real
// click timed into that window and asserts it has no effect at all: the Hero
// doesn't walk off to a second destination mid-delay, and the already-decided
// auto-attack still resolves normally afterward.
test("a click during the auto-attack highlight window is ignored", async ({
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
  // The Hero (move budget 3) has plenty left after the 1-step move onto
  // "harness_next" — a click here would be a perfectly legal further move if
  // input weren't locked, which is exactly what makes it a meaningful probe
  // of the highlight window.
  const far = await page.evaluate(() =>
    window.__test!.getTileScreenPositionBySection("harness_far")
  );
  if (!start || !next || !far) throw new Error("harness tiles not found on screen");

  await page.mouse.click(start.x, start.y); // select the Hero
  await page.mouse.click(next.x, next.y); // auto-paths adjacent to the single enemy

  // Timeline after the click above: ~600ms move tween (shared/game_world.ts's
  // Move case: 100ms delay + 500ms tween), then the ~400ms attack-highlight
  // delay this issue is about. 700ms lands inside that highlight window,
  // after the move has finished animating but before the pending attack
  // resolves.
  await page.waitForTimeout(700);
  await page.mouse.click(far.x, far.y); // must be swallowed, not queued or acted on

  // Give the auto-attack's own delay+dispatch time to finish.
  await expect
    .poll(() => page.evaluate(() => window.__test?.isSectionOccupied("harness_enemy_spot")))
    .toBe(false);

  // The stray click had no effect: the Hero is still where the auto-attack
  // left it, not off at "harness_far".
  expect(
    await page.evaluate(() => window.__test?.getUnitSectionByOwner("human"))
  ).toBe("harness_next");
});
