// Real (non-throwaway) generator — gh #192. Packs the 5-sprite unit roster
// into one dedicated "units" atlas, loaded once by main/preload.ts.
//
// Run with:
//   node ../../node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs \
//     src/game/assets_gen/generate_units_atlas.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { packAtlas } from "./atlas";
import { buildUnitSprites } from "./unit_sprites";

const SPRITES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../assets/sprites");

const sprites = buildUnitSprites();
const { png, json } = packAtlas(sprites, { imageName: "units-0.png" });

writeFileSync(join(SPRITES_DIR, "units-0.png"), png);
writeFileSync(join(SPRITES_DIR, "units-0.json"), JSON.stringify(json, null, 2));
console.log(`wrote units-0.png / units-0.json (${sprites.length} frames)`);
