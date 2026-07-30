// PROTOTYPE — throwaway. Answers gh issue #190: "what should the 5 unit
// archetypes look like?" Renders a montage on transparent, plus a montage
// composited onto the owner-color tint hex exactly as game_world.ts draws
// it today (radius-50 hex, 60% alpha). Not wired into preload.ts / the
// units atlas — see #192 for that.
//
// Run with:
//   node ../../node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs \
//     src/game/assets_gen/unit_preview.prototype.ts <output-dir>
import { writeFileSync, mkdirSync } from "node:fs";
import {
  createPixelGrid,
  setPixel,
  toRgbaImage,
  type Palette,
  type PixelGrid,
} from "./pixel_grid";
import { flatTopHexMask, upscaleNearestNeighbor } from "./hex_mask";
import { encodePng, type RgbaImage } from "./png";

// 32px native authoring grid (ADR-0005 / the map's Notes), upscaled x3
// nearest-neighbor -> 96x96, close to ship.png's current ~100x92 footprint.
const NATIVE = 32;
const SCALE = 3;

type Test = (x: number, y: number) => boolean;
interface Layer {
  test: Test;
  key: string;
}

const rect = (x0: number, y0: number, w: number, h: number): Test => (x, y) =>
  x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

const circle = (cx: number, cy: number, r: number): Test => (x, y) =>
  (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;

const points = (pts: [number, number][], size = 1): Test => (x, y) =>
  pts.some(([px, py]) => Math.abs(px - x) < size && Math.abs(py - y) < size);

const and = (a: Test, b: Test): Test => (x, y) => a(x, y) && b(x, y);
const not = (a: Test): Test => (x, y) => !a(x, y);

// Expands the silhouette by 1 native px into a dark outline — the
// standard low-res pixel-art readability trick.
function outlineSilhouette(grid: PixelGrid, key: string): PixelGrid {
  const height = grid.length;
  const width = height === 0 ? 0 : grid[0].length;
  const result = grid.map((row) => row.slice());

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] !== null) continue;
      const touchesFilled =
        (x > 0 && grid[y][x - 1] !== null) ||
        (x < width - 1 && grid[y][x + 1] !== null) ||
        (y > 0 && grid[y - 1][x] !== null) ||
        (y < height - 1 && grid[y + 1][x] !== null);
      if (touchesFilled) result[y][x] = key;
    }
  }

  return result;
}

function renderSprite(palette: Palette, layers: Layer[]): RgbaImage {
  let grid: PixelGrid = createPixelGrid(NATIVE, NATIVE, null);

  for (let y = 0; y < NATIVE; y++) {
    for (let x = 0; x < NATIVE; x++) {
      let key: string | null = null;
      for (const layer of layers) {
        if (layer.test(x, y)) key = layer.key;
      }
      if (key !== null) setPixel(grid, x, y, key);
    }
  }

  grid = outlineSilhouette(grid, "outline");
  const scaled = upscaleNearestNeighbor(grid, SCALE);
  return toRgbaImage(scaled, palette);
}

// ---- Unit archetype definitions ---------------------------------------

const hero = () =>
  renderSprite(
    {
      outline: "#1a1410",
      skin: "#e8b98a",
      hair: "#8a5a28",
      tunic: "#2f6fb0",
      tunicShade: "#24567f",
      belt: "#6b4a2c",
      pants: "#3a3a3a",
      boot: "#4a2f1a",
      steel: "#c9cdd6",
      gold: "#c9a227",
    },
    [
      // legs + boots
      { test: rect(11, 22, 3, 7), key: "pants" },
      { test: rect(17, 22, 3, 7), key: "pants" },
      { test: rect(10, 27, 4, 3), key: "boot" },
      { test: rect(16, 27, 4, 3), key: "boot" },
      // torso
      { test: rect(10, 13, 12, 10), key: "tunic" },
      { test: rect(10, 20, 12, 2), key: "belt" },
      { test: rect(19, 13, 3, 10), key: "tunicShade" },
      // left arm at side
      { test: rect(7, 14, 3, 7), key: "tunic" },
      { test: rect(7, 20, 3, 2), key: "skin" },
      // right arm raised, holding sword
      { test: points([[21,14],[22,13],[23,12],[24,11],[25,10],[26,9]], 1), key: "tunic" },
      { test: rect(26, 7, 2, 2), key: "skin" },
      // sword: hilt then blade continuing the arm's diagonal
      { test: points([[26,7],[27,8]], 1), key: "gold" },
      { test: points([[27,6],[28,5],[28,4],[29,3],[29,2],[30,1]], 1), key: "steel" },
      // head + hair
      { test: circle(16, 8, 4), key: "skin" },
      { test: and(circle(16, 8, 4), rect(11, 4, 10, 3)), key: "hair" },
      { test: rect(15, 11, 2, 2), key: "skin" },
    ],
  );

const wanderer = () =>
  renderSprite(
    {
      outline: "#161410",
      skin: "#d9ab7c",
      hood: "#4a5a3f",
      hoodShade: "#394630",
      cloak: "#5a6b4a",
      cloakShade: "#465538",
      stick: "#6b4a2c",
      shadow: "#241f18",
    },
    [
      // cloak: wide at the hem, narrow at the shoulders — a trapezoid.
      { test: rect(13, 14, 6, 4), key: "cloak" },
      { test: rect(11, 18, 10, 5), key: "cloak" },
      { test: rect(9, 23, 14, 6), key: "cloak" },
      { test: rect(9, 23, 3, 6), key: "cloakShade" },
      { test: rect(20, 23, 3, 6), key: "cloakShade" },
      // walking stick, held to the side, taller than the character.
      { test: points([[8,10],[8,11],[8,12],[8,13],[8,14],[8,15],[8,16],[8,17],[8,18],[8,19],[8,20]], 1), key: "stick" },
      // hood over the head, face mostly in shadow — reads as "traveler",
      // not "hero" (no visible hair/face detail).
      { test: circle(16, 9, 5), key: "hood" },
      { test: and(circle(16, 9, 5), rect(11, 11, 10, 3)), key: "hoodShade" },
      { test: rect(14, 10, 4, 3), key: "shadow" },
      { test: rect(15, 11, 1, 1), key: "skin" },
    ],
  );

const wolf = () =>
  renderSprite(
    {
      outline: "#141312",
      fur: "#9a9a94",
      furShade: "#78786f",
      belly: "#c8c8be",
      nose: "#2a2a26",
      eye: "#e8d24a",
    },
    [
      // side-profile quadruped: body barrel, head + snout to the right,
      // four legs, tail to the left.
      { test: rect(9, 15, 18, 8), key: "fur" },
      { test: rect(9, 20, 18, 3), key: "belly" },
      { test: points([[6,13],[7,14],[8,15]], 1), key: "furShade" },
      { test: rect(6, 12, 4, 4), key: "fur" }, // tail base
      // legs
      { test: rect(10, 22, 3, 6), key: "furShade" },
      { test: rect(16, 22, 3, 6), key: "furShade" },
      { test: rect(22, 22, 3, 6), key: "fur" },
      { test: rect(26, 22, 3, 6), key: "fur" },
      // head + snout
      { test: circle(26, 13, 5), key: "fur" },
      { test: rect(29, 14, 5, 3), key: "fur" }, // snout
      { test: rect(32, 15, 1, 1), key: "nose" },
      { test: rect(28, 8, 3, 4), key: "furShade" }, // ear
      { test: rect(27, 12, 1, 1), key: "eye" },
    ],
  );

const bandit = () =>
  renderSprite(
    {
      outline: "#100d0a",
      leather: "#3a3025",
      leatherShade: "#2b2319",
      skin: "#c99a6e",
      mask: "#241f1a",
      pants: "#2e2a24",
      boot: "#20180f",
      blade: "#9aa0a8",
    },
    [
      { test: rect(11, 22, 3, 7), key: "pants" },
      { test: rect(17, 22, 3, 7), key: "pants" },
      { test: rect(10, 27, 4, 3), key: "boot" },
      { test: rect(16, 27, 4, 3), key: "boot" },
      { test: rect(10, 13, 12, 10), key: "leather" },
      { test: rect(19, 13, 3, 10), key: "leatherShade" },
      { test: rect(7, 14, 3, 7), key: "leather" },
      { test: rect(21, 14, 3, 7), key: "leather" },
      // dagger held low at the hip, not raised — a threat, not a hero pose.
      { test: points([[23,20],[24,21],[25,22]], 1), key: "blade" },
      { test: rect(22, 19, 2, 2), key: "skin" },
      // hood + masked face — deliberately unreadable, unlike the hero's
      // visible hair/face.
      { test: circle(16, 8, 4), key: "leather" },
      { test: rect(13, 8, 6, 3), key: "mask" },
    ],
  );

const banditCaptain = () =>
  renderSprite(
    {
      outline: "#0d0a08",
      armor: "#4a2323",
      armorShade: "#331717",
      spike: "#8a8680",
      skin: "#c99a6e",
      mask: "#1a1512",
      pants: "#241d1a",
      boot: "#1a130c",
      blade: "#b0b6bc",
      sash: "#8a1f1f",
    },
    [
      // wider stance and taller than bandit/hero — reads "beefier".
      { test: rect(9, 23, 4, 7), key: "pants" },
      { test: rect(19, 23, 4, 7), key: "pants" },
      { test: rect(8, 28, 5, 3), key: "boot" },
      { test: rect(19, 28, 5, 3), key: "boot" },
      { test: rect(8, 13, 16, 11), key: "armor" },
      { test: rect(20, 13, 4, 11), key: "armorShade" },
      { test: rect(9, 20, 15, 2), key: "sash" },
      // wide shoulders + spiked pauldrons — the "boss" tell.
      { test: rect(5, 12, 5, 5), key: "armor" },
      { test: rect(23, 12, 5, 5), key: "armor" },
      { test: points([[5,11],[6,9],[7,11]], 1), key: "spike" },
      { test: points([[27,11],[28,9],[29,11]], 1), key: "spike" },
      // axe raised — bulkier weapon than the hero's sword.
      { test: points([[25,14],[26,13],[27,12],[28,11]], 1), key: "armor" },
      { test: rect(27, 6, 5, 5), key: "blade" },
      { test: rect(28, 5, 2, 1), key: "spike" },
      // head, larger, masked
      { test: circle(16, 8, 5), key: "armor" },
      { test: rect(12, 8, 8, 3), key: "mask" },
    ],
  );

// ---- Montage compositing ---------------------------------------------

const SPRITE = NATIVE * SCALE;

function solidCanvas(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(rgba, i * 4);
  return { width, height, pixels };
}

function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcOffset = (y * src.width + x) * 4;
      const a = src.pixels[srcOffset + 3];
      if (a === 0) continue;
      const dstOffset = ((dy + y) * dst.width + (dx + x)) * 4;
      if (a === 255) {
        dst.pixels.set(src.pixels.subarray(srcOffset, srcOffset + 4), dstOffset);
      } else {
        // straight alpha blend, for the tint-hex composite.
        for (let c = 0; c < 3; c++) {
          const s = src.pixels[srcOffset + c];
          const d = dst.pixels[dstOffset + c];
          dst.pixels[dstOffset + c] = Math.round((s * a + d * (255 - a)) / 255);
        }
        dst.pixels[dstOffset + 3] = 255;
      }
    }
  }
}

function montage(tiles: RgbaImage[], columns: number, cellW: number, cellH: number, bg: [number, number, number, number]): RgbaImage {
  const padding = 12;
  const cellStepW = cellW + padding;
  const cellStepH = cellH + padding;
  const rows = Math.ceil(tiles.length / columns);
  const width = columns * cellStepW + padding;
  const height = rows * cellStepH + padding;

  const canvas = solidCanvas(width, height, bg);
  tiles.forEach((image, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    blit(canvas, image, padding + col * cellStepW, padding + row * cellStepH);
  });
  return canvas;
}

// The owner-color tint hex exactly as game_world.ts draws it: a flat-top
// hex, radius 50 (~100x87 bbox), 60% alpha, drawn *under* the unit sprite.
function tintHex(rgb: [number, number, number]): RgbaImage {
  const w = 96;
  const h = 84;
  const mask = flatTopHexMask(w, h);
  const grid: PixelGrid = createPixelGrid(w, h, null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x]) setPixel(grid, x, y, "tint");
    }
  }
  const [r, g, b] = rgb;
  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  const image = toRgbaImage(grid, { tint: hex });
  // apply 60% alpha to match bgHex.alpha = 0.6 in game_world.ts
  for (let i = 0; i < image.pixels.length / 4; i++) {
    if (image.pixels[i * 4 + 3] > 0) image.pixels[i * 4 + 3] = Math.round(255 * 0.6);
  }
  return image;
}

function onTint(sprite: RgbaImage, rgb: [number, number, number]): RgbaImage {
  const canvas = solidCanvas(SPRITE, SPRITE, [43, 47, 54, 255]);
  const hex = tintHex(rgb);
  blit(canvas, hex, Math.round((SPRITE - hex.width) / 2), SPRITE - hex.height - 4);
  blit(canvas, sprite, 0, 0);
  return canvas;
}

// ---- Main ---------------------------------------------------------------

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: unit_preview.prototype.ts <output-dir>");
mkdirSync(outDir, { recursive: true });

const roster = [
  { name: "hero", image: hero() },
  { name: "wanderer", image: wanderer() },
  { name: "wolf", image: wolf() },
  { name: "bandit", image: bandit() },
  { name: "banditCaptain", image: banditCaptain() },
];

writeFileSync(
  `${outDir}/unit_roster.png`,
  encodePng(montage(roster.map((u) => u.image), 5, SPRITE, SPRITE, [43, 47, 54, 255])),
);

const BLUE: [number, number, number] = [0x33, 0x66, 0xff];
writeFileSync(
  `${outDir}/unit_roster_on_tint.png`,
  encodePng(
    montage(
      roster.map((u) => onTint(u.image, BLUE)),
      5,
      SPRITE,
      SPRITE,
      [20, 22, 26, 255],
    ),
  ),
);

console.log("wrote unit_roster.png (legend: " + roster.map((u) => u.name).join(", ") + ")");
console.log("wrote unit_roster_on_tint.png (same roster, composited on the blue owner-color tint hex)");
