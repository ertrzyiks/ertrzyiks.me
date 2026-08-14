// The `sync-loan-calendar` queue: one job per current loan, fanned out by
// ../refresh-library-loans/worker.ts and consumed by a second `Worker` started alongside it in
// server.ts. Separate from that queue because a refresh run and a single loan's calendar sync
// have different retry needs — a transient Calendar API error on one loan shouldn't retry the
// whole WBPG refresh.
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { DEFAULT_JOB_OPTIONS } from "../../retry.js";

export const LIBRARY_SYNC_QUEUE_NAME = "sync-loan-calendar";

export interface LoanSyncJobPayload {
  holdingId: number;
}

// `defaultJobOptions` (#348) — see retry.ts for the shared policy every queue in this app applies.
export function createQueue(redisUrl: string): Queue<LoanSyncJobPayload> {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(LIBRARY_SYNC_QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}

// Narrow seam libraryRefresh.ts depends on instead of the full BullMQ `Queue` — matches
// ../extract-action-items/queue.ts's `JobsQueue` abstraction, and lets that fan-out logic be
// unit-tested with a fake queue instead of a real Redis connection.
export interface LoanSyncQueue {
  enqueue(holdingId: number): Promise<void>;
}

export function createLoanSyncQueueAdapter(queue: Queue<LoanSyncJobPayload>): LoanSyncQueue {
  return {
    async enqueue(holdingId) {
      await queue.add(LIBRARY_SYNC_QUEUE_NAME, { holdingId });
    },
  };
}
