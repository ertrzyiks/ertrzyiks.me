// The `refresh-library-loans` queue: a single repeatable job (see server.ts's
// `upsertJobScheduler`) that logs into WBPG, refreshes the loans snapshot, and fans out one
// `sync-loan-calendar` job per current loan (see ../sync-loan-calendar/queue.ts) onto that
// second queue. Consumed by a `Worker` started inside server.ts, same as `sync-todoist` —
// neither WBPG login nor Google Calendar needs anything Mac-local.
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { logConnectionErrors } from "../../../../redisResilience.js";
import { DEFAULT_JOB_OPTIONS } from "../../../../retry.js";

export const LIBRARY_REFRESH_QUEUE_NAME = "refresh-library-loans";

// `defaultJobOptions` (#348) — see retry.ts for the shared policy every queue in this app applies.
export function createQueue(redisUrl: string): Queue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(LIBRARY_REFRESH_QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  logConnectionErrors(queue, `queue "${LIBRARY_REFRESH_QUEUE_NAME}"`);
  return queue;
}
