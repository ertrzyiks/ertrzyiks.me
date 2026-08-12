import { test, expect } from "@playwright/test";

// gh #214: clicking the board a second time during the intro (IntroWorld's
// "click again to skip" affordance, registered by teardown()) fires the
// intro's "exit" event, handled by game_loader.ts's close(). close() used to
// destroy every current app.stage child with
// `{ texture: true, textureSource: true }` — which destroys the underlying
// GPU TextureSource for whichever atlas that child's sprites read from
// (board1-0/units-0/intro-0), all loaded once per page session and reused by
// every later preload() call. PixiJS's own Assets cache doesn't know the
// resource is gone, so every subsequent texture lookup silently resolves to
// a broken resource for the rest of the page — not just this one instance.
// PixiJS warns exactly this: "A TextureSource managed by Assets was
// destroyed instead of unloaded! Use Assets.unload() instead of destroying
// the TextureSource." This drives the real skip-intro gesture (not the
// interaction harness, which deliberately bypasses the intro entirely) and
// asserts that warning never fires.
test("clicking the board again to skip the intro doesn't destroy the shared atlas textures", async ({
  page,
}) => {
  // Unlike every other interaction test, this one drives the real homepage
  // (`/`) instead of the lightweight `/interaction-harness` route (ADR
  // 0001), which is the whole point — it exercises the actual skip-intro
  // gesture, pulling in the full game bundle plus the real board1-0/units-0/
  // intro-0 texture atlases. On a cold `astro dev` server (every CI run:
  // webServer always starts fresh) that first compile has been observed to
  // border on or exceed the default 30s test timeout — e.g.
  // https://github.com/ertrzyiks/ertrzyiks.me/actions/runs/31493568680/job/93785630517
  // — passing only via CI's one retry, against the now-warm server. slow()
  // gives this one test the headroom to finish on its first attempt instead
  // of wasting a full fail-and-relaunch cycle on every flake.
  test.slow();

  const textureDestroyedWarnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning" && /destroyed instead of unloaded/.test(msg.text())) {
      textureDestroyedWarnings.push(msg.text());
    }
  });

  await page.goto("/");
  await page.waitForSelector("#warriors");

  // Click at a fixed point (not Playwright's default "center of #warriors",
  // so the exact coordinates are known) — game_loader.ts's initGame()
  // resolves with this point, and IntroWorld.setup() uses it to look up a
  // tile at that same screen position, starting the ship's placement
  // animation there and registering teardown()'s "clicked" listener.
  const box = (await page.locator("#warriors").boundingBox())!;
  const clickPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(clickPoint.x, clickPoint.y);

  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    return !!canvas && getComputedStyle(canvas).display !== "none";
  });

  // intro/index.ts's create() shows the canvas immediately but defers
  // world.setup() (and, inside it, the teardown() call that registers this
  // "clicked" skip listener) by 100ms — a click landing in that window is a
  // silent no-op (no listener yet). Give it a comfortable margin.
  await page.waitForTimeout(500);

  // #warriors never gets hidden/removed (main/preload.ts only swaps the
  // #game div for the canvas), so it's still sitting at the same screen
  // position underneath the now-visible canvas (z-index 2) — clicking the
  // exact same point again lands back on a tile we already know is real,
  // firing teardown()'s "clicked" listener -> the skip -> close() path.
  await page.mouse.click(clickPoint.x, clickPoint.y);

  // close()'s reinitialize() re-shows the pre-game state, waiting for a
  // fresh #warriors click — give it time to actually run.
  await expect
    .poll(() => page.evaluate(() => document.querySelector("canvas")?.style.display))
    .toBe("none");

  expect(textureDestroyedWarnings).toEqual([]);
});
