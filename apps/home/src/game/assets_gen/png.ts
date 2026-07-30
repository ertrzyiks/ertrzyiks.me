import { deflateSync } from "node:zlib";

export interface RgbaImage {
  width: number;
  height: number;
  // RGBA8888, row-major, length must be width*height*4.
  pixels: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);

  return Buffer.concat([length, typeBytes, data, crc]);
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Bit depth 8, color type 6 (RGBA), no interlacing/filtering beyond the
// per-scanline "None" filter every row is prefixed with below.
function encodeIhdr(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return chunk("IHDR", data);
}

function encodeIdat(image: RgbaImage): Buffer {
  const { width, height, pixels } = image;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    Buffer.from(
      pixels.buffer,
      pixels.byteOffset + y * stride,
      stride,
    ).copy(raw, rowStart + 1);
  }

  return chunk("IDAT", deflateSync(raw));
}

export function encodePng(image: RgbaImage): Buffer {
  const { width, height, pixels } = image;

  if (pixels.length !== width * height * 4) {
    throw new Error(
      `pixels length ${pixels.length} doesn't match width*height*4 (${width * height * 4})`,
    );
  }

  return Buffer.concat([
    SIGNATURE,
    encodeIhdr(width, height),
    encodeIdat(image),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
