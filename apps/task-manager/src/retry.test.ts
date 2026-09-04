import { describe, expect, it } from "vitest";
import { backoffStrategy, DEFAULT_JOB_OPTIONS, MAX_RETRY_WINDOW_MS } from "./retry.js";

// A MinimalJob is a wide interface (see bullmq's minimal-job.d.ts) — backoffStrategy only reads
// `timestamp`, so a fake with just that field satisfies it for these tests.
function jobCreatedAt(timestamp: number) {
  return { timestamp } as Parameters<typeof backoffStrategy>[3];
}

describe("DEFAULT_JOB_OPTIONS", () => {
  it("routes through the custom backoff strategy instead of a named built-in one", () => {
    expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({ type: "custom" });
  });

  it("allows enough attempts that the 7-day window, not the attempt count, is what stops retries", () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBeGreaterThan(100);
  });
});

describe("backoffStrategy", () => {
  it("waits 10s before the first retry", () => {
    expect(backoffStrategy(1, "custom", new Error("boom"), jobCreatedAt(Date.now()))).toBe(10_000);
  });

  it("doubles the delay on each subsequent attempt", () => {
    const now = Date.now();
    expect(backoffStrategy(2, "custom", new Error("boom"), jobCreatedAt(now))).toBe(20_000);
    expect(backoffStrategy(3, "custom", new Error("boom"), jobCreatedAt(now))).toBe(40_000);
    expect(backoffStrategy(4, "custom", new Error("boom"), jobCreatedAt(now))).toBe(80_000);
  });

  it("caps a single hop at 24h even for a job that has retried many times", () => {
    const now = Date.now();
    expect(backoffStrategy(20, "custom", new Error("boom"), jobCreatedAt(now))).toBe(24 * 60 * 60 * 1000);
  });

  it("keeps retrying while under the 7-day window", () => {
    const stillWithinWindow = Date.now() - (MAX_RETRY_WINDOW_MS - 1);
    expect(backoffStrategy(5, "custom", new Error("boom"), jobCreatedAt(stillWithinWindow))).toBeGreaterThan(0);
  });

  it("stops retrying (-1) once the job has been failing for 7 days", () => {
    const sevenDaysAgo = Date.now() - MAX_RETRY_WINDOW_MS;
    expect(backoffStrategy(5, "custom", new Error("boom"), jobCreatedAt(sevenDaysAgo))).toBe(-1);
  });

  it("stops retrying (-1) well past the 7-day window", () => {
    const twoWeeksAgo = Date.now() - MAX_RETRY_WINDOW_MS * 2;
    expect(backoffStrategy(50, "custom", new Error("boom"), jobCreatedAt(twoWeeksAgo))).toBe(-1);
  });

  it("falls back to the current time (never stops early) when the job has no timestamp", () => {
    expect(backoffStrategy(1, "custom", new Error("boom"), undefined)).toBe(10_000);
  });
});
