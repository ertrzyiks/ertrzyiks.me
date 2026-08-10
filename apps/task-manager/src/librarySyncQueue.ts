// Two BullMQ queues for the library-loan sync job, separate from queue.ts's
// `extract-action-items` queue (a different job entirely, consumed by the Mac worker — see
// worker.ts). Both of these are consumed by `Worker`s started inside server.ts, same as the
// sync-google-tasks queue, since neither WBPG login nor Google Calendar needs anything Mac-local.
//
// - `refresh-library-loans`: a single repeatable job (see server.ts) that logs into WBPG,
//   refreshes the `loans` table, and fans out one `sync-loan-calendar` job per current loan.
// - `sync-loan-calendar`: one job per current loan, processed by loanCalendarSync.ts.
import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const LIBRARY_REFRESH_QUEUE_NAME = "refresh-library-loans";
export const LIBRARY_SYNC_QUEUE_NAME = "sync-loan-calendar";

export interface LoanSyncJobPayload {
  holdingId: number;
}

export function createLibraryRefreshQueue(redisUrl: string): Queue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(LIBRARY_REFRESH_QUEUE_NAME, { connection });
}

export function createLibrarySyncQueue(redisUrl: string): Queue<LoanSyncJobPayload> {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(LIBRARY_SYNC_QUEUE_NAME, { connection });
}

// Narrow seam libraryRefresh.ts depends on instead of the full BullMQ `Queue` — matches
// jobsQueue.ts's `JobsQueue` abstraction, and lets that fan-out logic be unit-tested with a
// fake queue instead of a real Redis connection.
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
