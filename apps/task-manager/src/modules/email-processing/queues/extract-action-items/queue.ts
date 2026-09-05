// The `extract-action-items` queue: one job per email, consumed by this queue's own `Worker` (see
// ./worker.ts), started inside server.ts alongside every other queue in this package (formerly a
// Mac-only worker, back when a local LM Studio call meant email content couldn't leave the user's
// machine — see openRouter.ts's header comment for what changed). Producer side is app.ts's
// `POST /jobs`.
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { logConnectionErrors } from "../../../../redisResilience.js";
import { DEFAULT_JOB_OPTIONS } from "../../../../retry.js";

export const QUEUE_NAME = "extract-action-items";

// `defaultJobOptions` (#348) applies to every job added to this queue — the Jobs API's
// `queue.add()` calls (app.ts), and any job added by hand via Bull Board's "Add Job" button —
// without every call site needing to remember to pass it itself.
export function createQueue(redisUrl: string): Queue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  logConnectionErrors(queue, `queue "${QUEUE_NAME}"`);
  return queue;
}

// Narrow seam app.ts depends on instead of the full BullMQ `Queue` — lets its job-status
// endpoints be exercised with a fake queue instead of a real Redis connection.
export interface JobLike {
  id?: string;
  getState(): Promise<string>;
  returnvalue: unknown;
  failedReason?: string;
}

export interface JobsQueue {
  add(name: string, data: { emailId: string }): Promise<{ id?: string }>;
  getJob(jobId: string): Promise<JobLike | undefined>;
}
