import { describe, expect, it } from "vitest";
import { dayKeyOf, dayPartOf, isValidTimestamp } from "./dayPart.js";

describe("dayPartOf", () => {
  it.each([
    ["2026-08-09T00:00", "morning"],
    ["2026-08-09T10:59", "morning"],
    ["2026-08-09T11:00", "afternoon"],
    ["2026-08-09T16:59", "afternoon"],
    ["2026-08-09T17:00", "evening"],
    ["2026-08-09T23:59", "evening"],
  ] as const)("classifies %s as %s", (timestamp, expected) => {
    expect(dayPartOf(timestamp)).toBe(expected);
  });

  it("ignores seconds/milliseconds beyond HH:mm", () => {
    expect(dayPartOf("2026-08-09T11:00:59.999")).toBe("afternoon");
  });

  it("throws on a malformed timestamp", () => {
    expect(() => dayPartOf("not-a-timestamp")).toThrow(/Invalid timestamp/);
  });

  it("never reinterprets the string via a timezone (no Date involved)", () => {
    // A timestamp whose UTC and local renderings would disagree on hour still classifies purely
    // off the digits it's spelled with.
    expect(dayPartOf("2026-08-09T00:30")).toBe("morning");
  });
});

describe("dayKeyOf", () => {
  it("extracts the calendar day", () => {
    expect(dayKeyOf("2026-08-09T23:59")).toBe("2026-08-09");
  });

  it("throws on a malformed timestamp", () => {
    expect(() => dayKeyOf("2026/08/09 23:59")).toThrow(/Invalid timestamp/);
  });
});

describe("isValidTimestamp", () => {
  it("accepts a well-formed naive timestamp", () => {
    expect(isValidTimestamp("2026-08-09T23:59")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidTimestamp("")).toBe(false);
  });

  it("rejects a differently-formatted date", () => {
    expect(isValidTimestamp("2026/08/09 23:59")).toBe(false);
  });
});
