import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const QUEUE_NAME = "extract-action-items";

// `queueName` defaults to QUEUE_NAME so existing call sites (createQueue(redisUrl)) are
// unaffected; server.ts also uses this to build the `sync-google-tasks` queue (see
// googleTasksQueue.ts) — one Redis connection factory shared by both queues.
export function createQueue(redisUrl: string, queueName: string = QUEUE_NAME): Queue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(queueName, { connection });
}
