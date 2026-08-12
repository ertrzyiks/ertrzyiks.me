import { describe, expect, it, vi } from "vitest";
import { jobLoggerFor, noopJobLogger } from "./jobLogger.js";

describe("noopJobLogger", () => {
  it("does nothing", () => {
    expect(() => noopJobLogger("anything")).not.toThrow();
  });
});

describe("jobLoggerFor", () => {
  it("forwards messages to the job's log()", () => {
    const job = { log: vi.fn().mockResolvedValue(1) };

    jobLoggerFor(job)("progress note");

    expect(job.log).toHaveBeenCalledWith("progress note");
  });

  it("swallows a rejected job.log() instead of throwing (#348) — a log write must never fail the job", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const job = { log: vi.fn().mockRejectedValue(new Error("redis down")) };

    expect(() => jobLoggerFor(job)("progress note")).not.toThrow();
    await Promise.resolve(); // let the rejection's .catch() handler run
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith("job.log failed:", expect.any(Error));
    consoleError.mockRestore();
  });
});
