// BullMQ wiring for the `sync-todoist` queue — the actual "create one Todoist task" logic lives
// in todoistJobProcessor.ts, independent of BullMQ; this file is only the `Worker` construction,
// its rate limiter, and its `ready`/`failed` listeners, extracted out of server.ts so the
// queue/worker pairing matches every other queue under src/modules/*/queues/.
import type { ConnectionOptions } from "bullmq";
import { Worker } from "bullmq";
import type { TodoistJobPayload, TodoistJobResult } from "./todoistTask.js";
import { processTodoistJob, type TodoistJobProcessorDeps } from "./todoistJobProcessor.js";
import { jobLoggerFor } from "../../../../jobLogger.js";
import { logConnectionErrors } from "../../../../redisResilience.js";
import { backoffStrategy } from "../../../../retry.js";
import { Sentry } from "../../../../sentry.js";
import type { WorkerLogger } from "../../../../workerLogger.js";
import { TODOIST_QUEUE_NAME } from "./queue.js";

export interface CreateWorkerOptions {
  /** Throttles how fast this worker drains the queue (max jobs per `duration` ms) — added after a
   * real "quota exceeded" error from a burst of jobs hitting the Google Tasks API at once, kept
   * here as the same conservative default in case Todoist's API turns out to have similar limits. */
  limiter?: { max: number; duration: number };
  /** Where "ready"/"failed" get logged — defaults to `console`; server.ts passes Fastify's
   * `app.log` instead, matching every other worker started in that process. */
  logger?: WorkerLogger;
}

export function createWorker(
  connection: ConnectionOptions,
  deps: TodoistJobProcessorDeps,
  options: CreateWorkerOptions = {},
): Worker<TodoistJobPayload, TodoistJobResult> {
  const logger = options.logger ?? console;

  const worker = new Worker<TodoistJobPayload, TodoistJobResult>(
    TODOIST_QUEUE_NAME,
    async (job) => processTodoistJob(job.data, { ...deps, log: jobLoggerFor(job) }),
    // `settings.backoffStrategy` (#348/#370) — see retry.ts; pairs with DEFAULT_JOB_OPTIONS'
    // `backoff: { type: "custom" }` on queue.ts to cap retries at 7 days.
    { connection, limiter: options.limiter, settings: { backoffStrategy } },
  );

  worker.on("ready", () => {
    logger.info(`sync-todoist worker ready, consuming queue "${TODOIST_QUEUE_NAME}"`);
  });

  worker.on("failed", (job, error) => {
    logger.error(`Todoist sync job ${job?.id ?? "<unknown>"} failed: ${error}`);
    Sentry.captureException(error, { tags: { queue: TODOIST_QUEUE_NAME, jobId: job?.id } });
  });

  // Keeps a Redis disconnect from crashing this process — see redisResilience.ts.
  logConnectionErrors(worker, `worker "${TODOIST_QUEUE_NAME}"`, logger);

  return worker;
}
