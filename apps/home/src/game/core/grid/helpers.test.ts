import { describe, expect, test } from "vitest";
import { hexDistance, cubeKey, positionAt } from "./helpers";

describe("hexDistance", () => {
  test("same position is 0", () => {
    const pos = { q: 0, r: 0, s: 0 };
    expect(hexDistance(pos, pos)).toBe(0);
  });

  test("adjacent tiles in each direction are distance 1", () => {
    const origin = { q: 0, r: 0, s: 0 };
    const neighbors = [
      { q: 1, r: -1, s: 0 },
      { q: 1, r: 0, s: -1 },
      { q: 0, r: 1, s: -1 },
      { q: -1, r: 1, s: 0 },
      { q: -1, r: 0, s: 1 },
      { q: 0, r: -1, s: 1 },
    ];
    for (const n of neighbors) {
      expect(hexDistance(origin, n)).toBe(1);
    }
  });

  test("two hops away is distance 2", () => {
    expect(hexDistance({ q: 0, r: 0, s: 0 }, { q: 2, r: -2, s: 0 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0, s: 0 }, { q: 2, r: -1, s: -1 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0, s: 0 }, { q: 0, r: 2, s: -2 })).toBe(2);
  });

  test("is symmetric", () => {
    const a = { q: 3, r: -2, s: -1 };
    const b = { q: -1, r: 2, s: -1 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  test("works with negative coordinates", () => {
    expect(hexDistance({ q: -3, r: 2, s: 1 }, { q: -1, r: 1, s: 0 })).toBe(2);
  });

  test("positionAt neighbor is always distance 1 from origin", () => {
    const origin = { q: 0, r: 0, s: 0 };
    for (const dir of ["n", "s", "ne", "sw", "nw", "se"]) {
      const neighbor = positionAt(origin, dir);
      expect(hexDistance(origin, neighbor)).toBe(1);
    }
  });
});

describe("cubeKey", () => {
  test("encodes positive coordinates", () => {
    expect(cubeKey({ q: 1, r: 2, s: -3 })).toBe("1,2,-3");
  });

  test("encodes zero coordinates", () => {
    expect(cubeKey({ q: 0, r: 0, s: 0 })).toBe("0,0,0");
  });

  test("encodes negative coordinates", () => {
    expect(cubeKey({ q: -1, r: -2, s: 3 })).toBe("-1,-2,3");
  });

  test("same coords always produce the same key", () => {
    const pos = { q: 4, r: -1, s: -3 };
    expect(cubeKey(pos)).toBe(cubeKey(pos));
  });

  test("different coords produce different keys", () => {
    expect(cubeKey({ q: 0, r: 0, s: 0 })).not.toBe(cubeKey({ q: 1, r: -1, s: 0 }));
    expect(cubeKey({ q: 1, r: 0, s: -1 })).not.toBe(cubeKey({ q: 0, r: 1, s: -1 }));
  });
});
