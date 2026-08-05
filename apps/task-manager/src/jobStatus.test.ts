import { describe, expect, it } from "vitest";
import { toSimplifiedStatus } from "./jobStatus.js";

describe("toSimplifiedStatus", () => {
  it.each([
    ["completed", "completed"],
    ["failed", "failed"],
    ["active", "active"],
    ["waiting", "pending"],
    ["delayed", "pending"],
    ["paused", "pending"],
    ["waiting-children", "pending"],
    ["prioritized", "pending"],
    ["unknown", "pending"],
  ] as const)("maps bull state %s to %s", (bullState, expected) => {
    expect(toSimplifiedStatus(bullState)).toBe(expected);
  });
});
