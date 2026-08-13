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
import { DEFAULT_JOB_OPTIONS } from "./retry.js";

export const LIBRARY_REFRESH_QUEUE_NAME = "refresh-library-loans";
export const LIBRARY_SYNC_QUEUE_NAME = "sync-loan-calendar";

export interface LoanSyncJobPayload {
  holdingId: number;
}

// `defaultJobOptions` (#348) — see retry.ts for the shared policy this and createLibrarySyncQueue
// apply to every job on their queue, same as queue.ts's createQueue.
export function createLibraryRefreshQueue(redisUrl: string): Queue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(LIBRARY_REFRESH_QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}

export function createLibrarySyncQueue(redisUrl: string): Queue<LoanSyncJobPayload> {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(LIBRARY_SYNC_QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
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
