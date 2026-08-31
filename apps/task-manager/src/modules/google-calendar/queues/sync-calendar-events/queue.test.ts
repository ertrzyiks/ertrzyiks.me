import { describe, expect, it, vi } from "vitest";
import { DEFAULT_JOB_OPTIONS } from "../../../../retry.js";

// See ../../email-processing/queues/extract-action-items/queue.test.ts's header comment — same
// mocking rationale.
const QueueMock = vi.fn();
vi.mock("bullmq", () => ({ Queue: QueueMock }));
vi.mock("ioredis", () => ({ Redis: vi.fn() }));

describe("createQueue", () => {
  it("applies the shared retry policy (#348) as defaultJobOptions", async () => {
    const { createQueue, CALENDAR_EVENTS_QUEUE_NAME } = await import("./queue.js");

    createQueue("redis://localhost:6379");

    expect(QueueMock).toHaveBeenCalledWith(
      CALENDAR_EVENTS_QUEUE_NAME,
      expect.objectContaining({ defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    );
  });
});
