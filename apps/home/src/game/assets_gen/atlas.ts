import { encodePng, type RgbaImage } from "./png";

export interface NamedSprite {
  name: string;
  image: RgbaImage;
}

export interface PackAtlasOptions {
  // Name written to meta.image (e.g. "units-0.png") — purely descriptive,
  // preload.ts loads the PNG by import path rather than this field.
  imageName: string;
  // Transparent margin kept around every sprite, and half the gap between
  // adjacent sprites (each side contributes its own padding).
  padding?: number;
  maxWidth?: number;
}

interface TexturePackerFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface TexturePackerManifest {
  frames: Record<string, TexturePackerFrame>;
  meta: {
    app: string;
    version: string;
    image: string;
    format: "RGBA8888";
    size: { w: number; h: number };
    scale: string;
  };
}

export interface PackedAtlas {
  png: Buffer;
  json: TexturePackerManifest;
}

export function packAtlas(
  sprites: NamedSprite[],
  options: PackAtlasOptions,
): PackedAtlas {
  const { imageName, padding = 1, maxWidth = Infinity } = options;

  if (sprites.length === 0) {
    throw new Error("packAtlas requires at least one sprite");
  }

  const names = new Set(sprites.map((s) => s.name));
  if (names.size !== sprites.length) {
    throw new Error("packAtlas received duplicate sprite names");
  }

  let cursorX = padding;
  let cursorY = padding;
  let rowHeight = 0;
  let firstInRow = true;
  let canvasWidth = 0;

  const placements = sprites.map((sprite) => {
    const { width, height } = sprite.image;

    if (!firstInRow && cursorX + width + padding > maxWidth) {
      cursorY += rowHeight + padding * 2;
      cursorX = padding;
      rowHeight = 0;
      firstInRow = true;
    }

    const x = cursorX;
    const y = cursorY;

    canvasWidth = Math.max(canvasWidth, x + width + padding);
    cursorX += width + padding * 2;
    rowHeight = Math.max(rowHeight, height);
    firstInRow = false;

    return { sprite, x, y };
  });

  const canvasHeight = cursorY + rowHeight + padding;
  const pixels = new Uint8Array(canvasWidth * canvasHeight * 4);

  const frames: Record<string, TexturePackerFrame> = {};

  for (const { sprite, x, y } of placements) {
    const { width, height, pixels: spritePixels } = sprite.image;

    for (let row = 0; row < height; row++) {
      const srcOffset = row * width * 4;
      const dstOffset = ((y + row) * canvasWidth + x) * 4;
      pixels.set(
        spritePixels.subarray(srcOffset, srcOffset + width * 4),
        dstOffset,
      );
    }

    frames[sprite.name] = {
      frame: { x, y, w: width, h: height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height },
      sourceSize: { w: width, h: height },
    };
  }

  const png = encodePng({ width: canvasWidth, height: canvasHeight, pixels });

  return {
    png,
    json: {
      frames,
      meta: {
        app: "ertrzyiks.me hand-rolled atlas packer",
        version: "1.0",
        image: imageName,
        format: "RGBA8888",
        size: { w: canvasWidth, h: canvasHeight },
        scale: "1",
      },
    },
  };
}
