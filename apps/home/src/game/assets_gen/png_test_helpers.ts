import { inflateSync } from "node:zlib";
import type { RgbaImage } from "./png";

// Decodes a PNG produced by encodePng() back into raw RGBA pixels, without
// depending on an external PNG library — mirrors the encoder's own
// assumptions (8-bit RGBA, filter type None on every scanline, a single
// IDAT chunk sequence). Test-only: real consumers (pixi.js/Assets.load) do
// their own decoding.
export function decodePngToRgba(png: Buffer): RgbaImage {
  let offset = 8; // skip the fixed 8-byte signature
  let width = 0;
  let height = 0;
  const idatChunks: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    }

    offset += 8 + length + 4;
  }

  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * 4;
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1) + 1; // skip the filter-type byte
    raw.copy(pixels, y * stride, rowStart, rowStart + stride);
  }

  return { width, height, pixels };
}
