import { describe, expect, it, vi } from "vitest";
import { DEFAULT_JOB_OPTIONS } from "./retry.js";

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

  it("passes a custom queue name through unchanged", async () => {
    const { createQueue } = await import("./queue.js");

    createQueue("redis://localhost:6379", "sync-google-tasks");

    expect(QueueMock).toHaveBeenCalledWith(
      "sync-google-tasks",
      expect.objectContaining({ defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    );
  });
});

describe("createLibraryRefreshQueue / createLibrarySyncQueue", () => {
  it("both apply the shared retry policy (#348) as defaultJobOptions", async () => {
    const { createLibraryRefreshQueue, createLibrarySyncQueue, LIBRARY_REFRESH_QUEUE_NAME, LIBRARY_SYNC_QUEUE_NAME } =
      await import("./librarySyncQueue.js");

    createLibraryRefreshQueue("redis://localhost:6379");
    createLibrarySyncQueue("redis://localhost:6379");

    expect(QueueMock).toHaveBeenCalledWith(
      LIBRARY_REFRESH_QUEUE_NAME,
      expect.objectContaining({ defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    );
    expect(QueueMock).toHaveBeenCalledWith(
      LIBRARY_SYNC_QUEUE_NAME,
      expect.objectContaining({ defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    );
  });
});
