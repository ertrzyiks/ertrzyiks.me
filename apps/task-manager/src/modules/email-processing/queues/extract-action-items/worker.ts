// BullMQ wiring for the `extract-action-items` queue — the actual "fetch, extract" logic
// lives in jobProcessor.ts, independent of BullMQ, so it can be unit-tested with fakes; this file
// is only the `Worker` construction, its rate limiter, and its `ready`/`failed` listeners,
// extracted out of server.ts so the queue/worker pairing matches every other queue under
// src/modules/*/queues/ (this queue used to have its own top-level Mac worker.ts entrypoint —
// removed once extract-action-items moved onto OpenRouter and stopped needing a Mac, see
// openRouter.ts's header comment).
import type { ConnectionOptions } from "bullmq";
import { Worker } from "bullmq";
import type { EmailJobPayload, EmailJobResult } from "./actionItem.js";
import { processEmailJob, type JobProcessorDeps } from "./jobProcessor.js";
import { jobLoggerFor } from "../../../../jobLogger.js";
import { logConnectionErrors } from "../../../../redisResilience.js";
import { backoffStrategy } from "../../../../retry.js";
import { Sentry } from "../../../../sentry.js";
import type { WorkerLogger } from "../../../../workerLogger.js";
import { QUEUE_NAME } from "./queue.js";

export interface CreateWorkerOptions {
  /** Throttles how fast this worker drains the queue (max jobs per `duration` ms) — OpenRouter's
   * free-tier models enforce their own (often quite low) requests-per-minute ceiling, so a burst
   * of scheduled jobs is smoothed out over time instead of firing at OpenRouter all at once, same
   * reasoning as sync-todoist's/sync-calendar-events' limiters. */
  limiter?: { max: number; duration: number };
  /** Where "ready"/"failed" get logged — defaults to `console`; server.ts passes Fastify's
   * `app.log` instead, matching every other worker started in that process. */
  logger?: WorkerLogger;
}

export function createWorker(
  connection: ConnectionOptions,
  deps: JobProcessorDeps,
  options: CreateWorkerOptions = {},
): Worker<EmailJobPayload, EmailJobResult> {
  const logger = options.logger ?? console;

  const worker = new Worker<EmailJobPayload, EmailJobResult>(
    QUEUE_NAME,
    async (job) => processEmailJob(job.data.emailId, { ...deps, log: jobLoggerFor(job) }),
    // `settings.backoffStrategy` (#348/#370) — see retry.ts; pairs with DEFAULT_JOB_OPTIONS'
    // `backoff: { type: "custom" }` on queue.ts to cap retries at 7 days.
    { connection, limiter: options.limiter, settings: { backoffStrategy } },
  );

  worker.on("ready", () => {
    logger.info(`task-manager worker ready, consuming queue "${QUEUE_NAME}"`);
  });

  worker.on("failed", (job, error) => {
    logger.error(`Job ${job?.id ?? "<unknown>"} failed:`, error);
    Sentry.captureException(error, { tags: { queue: QUEUE_NAME, jobId: job?.id } });
  });

  // Keeps a Redis disconnect (e.g. the Mac worker briefly losing network) from crashing this
  // process — see redisResilience.ts.
  logConnectionErrors(worker, `worker "${QUEUE_NAME}"`, logger);

  return worker;
}
