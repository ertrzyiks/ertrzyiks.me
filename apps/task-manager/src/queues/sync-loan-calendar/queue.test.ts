import { describe, expect, it, vi } from "vitest";
import { DEFAULT_JOB_OPTIONS } from "../../retry.js";

// See ../extract-action-items/queue.test.ts's header comment — same mocking rationale.
const QueueMock = vi.fn();
vi.mock("bullmq", () => ({ Queue: QueueMock }));
vi.mock("ioredis", () => ({ Redis: vi.fn() }));

describe("createQueue", () => {
  it("applies the shared retry policy (#348) as defaultJobOptions", async () => {
    const { createQueue, LIBRARY_SYNC_QUEUE_NAME } = await import("./queue.js");

    createQueue("redis://localhost:6379");

    expect(QueueMock).toHaveBeenCalledWith(
      LIBRARY_SYNC_QUEUE_NAME,
      expect.objectContaining({ defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    );
  });
});

describe("createLoanSyncQueueAdapter", () => {
  it("enqueues onto the sync-loan-calendar queue by holdingId", async () => {
    const { createLoanSyncQueueAdapter, LIBRARY_SYNC_QUEUE_NAME } = await import("./queue.js");
    const add = vi.fn();

    const adapter = createLoanSyncQueueAdapter({ add } as never);
    await adapter.enqueue(42);

    expect(add).toHaveBeenCalledWith(LIBRARY_SYNC_QUEUE_NAME, { holdingId: 42 });
  });
});
