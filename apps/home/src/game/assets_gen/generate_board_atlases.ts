// Real (non-throwaway) generator — gh #191. Writes each terrain texture as
// its own PNG under assets/all/ (per-board `files.txt` manifests reference
// them by filename, same convention the old TexturePacker-based
// scripts/generate-sprites.sh used), then packs board1-0/board2-0/board3-0
// atlases straight from those same in-memory images.
//
// Run with:
//   node ../../node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs \
//     src/game/assets_gen/generate_board_atlases.ts
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { packAtlas, type NamedSprite } from "./atlas";
import { encodePng } from "./png";
import { TERRAIN_ROSTER, buildTerrainSprites } from "./terrain_sprites";

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../assets");
const ALL_DIR = join(ASSETS_DIR, "all");
const SPRITES_DIR = join(ASSETS_DIR, "sprites");
const BOARDS = ["board1", "board2", "board3"];

const sprites = buildTerrainSprites();
const byName = new Map(sprites.map((s) => [s.name, s]));

for (const { name } of TERRAIN_ROSTER) {
  const sprite = byName.get(name);
  if (!sprite) throw new Error(`missing generated sprite for "${name}"`);
  writeFileSync(join(ALL_DIR, `${name}.png`), encodePng(sprite.image));
}
console.log(`wrote ${TERRAIN_ROSTER.length} terrain PNGs to ${ALL_DIR}`);

for (const board of BOARDS) {
  const manifestPath = join(ASSETS_DIR, board, "files.txt");
  const names = readFileSync(manifestPath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\.png$/, ""));

  const boardSprites: NamedSprite[] = names.map((name) => {
    const sprite = byName.get(name);
    if (!sprite) {
      throw new Error(`"${manifestPath}" lists unknown texture "${name}"`);
    }
    return sprite;
  });

  const { png, json } = packAtlas(boardSprites, { imageName: `${board}-0.png` });
  writeFileSync(join(SPRITES_DIR, `${board}-0.png`), png);
  writeFileSync(join(SPRITES_DIR, `${board}-0.json`), JSON.stringify(json, null, 2));
  console.log(`wrote ${board}-0.png / ${board}-0.json (${boardSprites.length} frames)`);
}
