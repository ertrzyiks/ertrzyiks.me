import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const QUEUE_NAME = "extract-action-items";

export function createQueue(redisUrl: string): Queue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(QUEUE_NAME, { connection });
}
