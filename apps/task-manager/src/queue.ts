import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { DEFAULT_JOB_OPTIONS } from "./retry.js";

export const QUEUE_NAME = "extract-action-items";

// `queueName` defaults to QUEUE_NAME so existing call sites (createQueue(redisUrl)) are
// unaffected; server.ts also uses this to build the `sync-google-tasks` queue (see
// googleTasksQueue.ts) — one Redis connection factory shared by both queues.
//
// `defaultJobOptions` (#348) applies to every job added to this queue — the Jobs API's
// `queue.add()` calls (app.ts), and any job added by hand via Bull Board's "Add Job" button —
// without every call site needing to remember to pass it itself.
export function createQueue(redisUrl: string, queueName: string = QUEUE_NAME): Queue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(queueName, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}
