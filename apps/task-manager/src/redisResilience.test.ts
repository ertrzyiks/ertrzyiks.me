import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { logConnectionErrors } from "./redisResilience.js";

describe("logConnectionErrors", () => {
  it("logs an emitted error instead of letting it throw as unhandled", () => {
    // A Node EventEmitter throws synchronously on an "error" event with no listener — this is
    // exactly the crash `logConnectionErrors` exists to prevent for BullMQ's `Queue`/`Worker`
    // (both real `EventEmitter`s that forward their Redis connection's "error" event, see the
    // header comment in redisResilience.ts). Using a plain `EventEmitter` here is enough to prove
    // the listener is attached and doesn't itself throw — it doesn't need a real BullMQ instance.
    const emitter = new EventEmitter();
    const logger = { info: vi.fn(), error: vi.fn() };
    const error = new Error("connect ECONNREFUSED");

    logConnectionErrors(emitter, 'worker "some-queue"', logger);

    expect(() => emitter.emit("error", error)).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      'worker "some-queue": Redis connection error, will keep retrying:',
      error,
    );
  });

  it("defaults to console when no logger is passed", () => {
    const emitter = new EventEmitter();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("connect ECONNREFUSED");

    logConnectionErrors(emitter, 'queue "some-queue"');
    emitter.emit("error", error);

    expect(consoleError).toHaveBeenCalledWith(
      'queue "some-queue": Redis connection error, will keep retrying:',
      error,
    );

    consoleError.mockRestore();
  });
});
