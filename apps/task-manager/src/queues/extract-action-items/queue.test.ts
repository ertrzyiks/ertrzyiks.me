import { describe, expect, it, vi } from "vitest";
import { DEFAULT_JOB_OPTIONS } from "../../retry.js";

// bullmq/ioredis are mocked rather than exercised for real — this only asserts *this file's*
// wiring (defaultJobOptions is passed through to `new Queue(...)`, #348), not BullMQ's or
// ioredis's own behavior. Mirrors sentry.test.ts's treatment of @sentry/node.
const QueueMock = vi.fn();
vi.mock("bullmq", () => ({ Queue: QueueMock }));
vi.mock("ioredis", () => ({ Redis: vi.fn() }));

describe("createQueue", () => {
  it("applies the shared retry policy (#348) as defaultJobOptions", async () => {
    const { createQueue, QUEUE_NAME } = await import("./queue.js");

    createQueue("redis://localhost:6379");

    expect(QueueMock).toHaveBeenCalledWith(
      QUEUE_NAME,
      expect.objectContaining({ defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    );
  });
});
