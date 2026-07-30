import { describe, expect, test } from "vitest";
import { inflateSync } from "node:zlib";
import { crc32, encodePng } from "./png";

// Every PNG's IEND chunk is the 4 ASCII bytes "IEND" followed by zero data
// bytes, so its CRC-32 is a fixed, independently-known constant — a good
// correctness check for a hand-rolled CRC-32 that doesn't require decoding
// anything.
describe("crc32", () => {
  test("matches the well-known CRC of an empty IEND chunk", () => {
    expect(crc32(Buffer.from("IEND", "ascii"))).toBe(0xae426082);
  });
});

function readChunks(png: Buffer) {
  const signature = png.subarray(0, 8);
  const chunks: { type: string; data: Buffer; crc: number }[] = [];
  let offset = 8;

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = png.readUInt32BE(offset + 8 + length);
    chunks.push({ type, data: Buffer.from(data), crc });
    offset += 8 + length + 4;
  }

  return { signature, chunks };
}

describe("encodePng", () => {
  test("starts with the PNG signature", () => {
    const png = encodePng({
      width: 1,
      height: 1,
      pixels: Uint8Array.from([255, 0, 0, 255]),
    });

    const { signature } = readChunks(png);
    expect([...signature]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  test("emits IHDR, IDAT, IEND in order with a correct CRC on every chunk", () => {
    const png = encodePng({
      width: 2,
      height: 2,
      pixels: Uint8Array.from([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
      ]),
    });

    const { chunks } = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);

    for (const c of chunks) {
      const crcInput = Buffer.concat([Buffer.from(c.type, "ascii"), c.data]);
      expect(c.crc).toBe(crc32(crcInput));
    }
  });

  test("writes an IHDR describing an 8-bit RGBA image of the given size", () => {
    const png = encodePng({
      width: 3,
      height: 5,
      pixels: new Uint8Array(3 * 5 * 4),
    });

    const { chunks } = readChunks(png);
    const ihdr = chunks.find((c) => c.type === "IHDR")!.data;

    expect(ihdr.readUInt32BE(0)).toBe(3); // width
    expect(ihdr.readUInt32BE(4)).toBe(5); // height
    expect(ihdr[8]).toBe(8); // bit depth
    expect(ihdr[9]).toBe(6); // color type: RGBA
    expect(ihdr[10]).toBe(0); // compression method
    expect(ihdr[11]).toBe(0); // filter method
    expect(ihdr[12]).toBe(0); // interlace method
  });

  test("round-trips arbitrary RGBA pixels through inflate", () => {
    const width = 4;
    const height = 3;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = (i * 17) % 256;
    }

    const png = encodePng({ width, height, pixels });
    const { chunks } = readChunks(png);
    const idat = Buffer.concat(
      chunks.filter((c) => c.type === "IDAT").map((c) => c.data),
    );
    const raw = inflateSync(idat);

    // Each scanline is prefixed with a filter-type byte, which we always
    // emit as 0 (None) — so the decoded pixels are the filter byte stripped
    // from every row.
    const stride = width * 4;
    const decoded = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const rowStart = y * (stride + 1);
      expect(raw[rowStart]).toBe(0);
      raw.copy(decoded, y * stride, rowStart + 1, rowStart + 1 + stride);
    }

    expect([...decoded]).toEqual([...pixels]);
  });

  test("throws when the pixel buffer doesn't match width*height*4", () => {
    expect(() =>
      encodePng({ width: 2, height: 2, pixels: new Uint8Array(3) }),
    ).toThrow();
  });
});
