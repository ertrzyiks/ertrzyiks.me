import { test, expect } from "@playwright/test";

// gh #213: main/preload.ts used to load the units atlas by manually
// constructing `new Spritesheet(texture, data)` + `.parse()`, then relying
// on `Texture.from(name)` in game_world.ts's Spawn handling to find "hero"/
// "wolf"/etc. That never worked — PixiJS's Cache only gets a per-frame entry
// per name when a Spritesheet is loaded through the real `Assets.load(".json")`
// pipeline (its CacheParser expands one Cache entry into one per frame); a
// manually-constructed-and-parsed Spritesheet never touches Cache.set() at
// all. So every unit rendered with no icon, and PixiJS logged a
// "[Assets] Asset id <name> was not found in the Cache" warning on every
// single spawn. This drives a real spawn (the harness's Hero) and asserts
// that warning never fires — it would have fired on every run before the fix.
test("spawning a unit resolves its icon texture without a Cache-miss warning", async ({
  page,
}) => {
  const cacheMissWarnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning" && /was not found in the Cache/.test(msg.text())) {
      cacheMissWarnings.push(msg.text());
    }
  });

  await page.goto("/interaction-harness");

  // Confirms the Hero has actually been spawned (not just that preload()
  // resolved) before asserting no warning fired for it.
  await expect
    .poll(() => page.evaluate(() => window.__test?.getUnitSectionByOwner("human")))
    .toBe("harness_start");

  expect(cacheMissWarnings).toEqual([]);
});
