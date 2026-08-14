// The `extract-action-items` queue: one job per email, consumed by the Mac worker (see
// ./worker.ts) — the only component allowed to read raw email content. Producer side is
// app.ts's `POST /jobs`.
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { DEFAULT_JOB_OPTIONS } from "../../../../retry.js";

export const QUEUE_NAME = "extract-action-items";

// `defaultJobOptions` (#348) applies to every job added to this queue — the Jobs API's
// `queue.add()` calls (app.ts), and any job added by hand via Bull Board's "Add Job" button —
// without every call site needing to remember to pass it itself.
export function createQueue(redisUrl: string): Queue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
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
