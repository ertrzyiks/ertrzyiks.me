// The `sync-todoist` queue: one job per action item to push to Todoist, consumed by a `Worker`
// started alongside the Jobs API server in server.ts — unlike `extract-action-items`, this one
// runs in the cloud (pushing an already-extracted action item has none of the "must never leave
// local processing" constraints that keep Gmail content-reading on the Mac worker, see
// ../extract-action-items/worker.ts). Producer side is app.ts's `POST /todoist-jobs`;
// `personal-assistant`'s sync loop is the only caller.
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { TodoistJobPayload } from "./todoistTask.js";
import { logConnectionErrors } from "../../../../redisResilience.js";
import { DEFAULT_JOB_OPTIONS } from "../../../../retry.js";

export const TODOIST_QUEUE_NAME = "sync-todoist";

// `defaultJobOptions` (#348) — see retry.ts for the shared policy every queue in this app applies.
export function createQueue(redisUrl: string): Queue<TodoistJobPayload> {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<TodoistJobPayload>(TODOIST_QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  logConnectionErrors(queue, `queue "${TODOIST_QUEUE_NAME}"`);
  return queue;
}

// Mirrors ../extract-action-items/queue.ts's JobLike/JobsQueue, typed to the sync-todoist
// payload instead of `{ emailId }` — kept as a separate small interface (rather than a generic
// JobsQueue<T>) to match this codebase's existing per-queue file convention.
export interface TodoistJobLike {
  id?: string;
  getState(): Promise<string>;
  returnvalue: unknown;
  failedReason?: string;
}

export interface TodoistJobsQueue {
  add(name: string, data: TodoistJobPayload): Promise<{ id?: string }>;
  getJob(jobId: string): Promise<TodoistJobLike | undefined>;
}
