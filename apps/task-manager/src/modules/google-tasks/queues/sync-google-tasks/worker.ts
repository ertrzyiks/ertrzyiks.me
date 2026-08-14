// BullMQ wiring for the `sync-google-tasks` queue — the actual "create one Google Task" logic
// lives in googleTasksJobProcessor.ts, independent of BullMQ; this file is only the `Worker`
// construction, its rate limiter, and its `ready`/`failed` listeners, extracted out of server.ts
// so the queue/worker pairing matches every other queue under src/modules/*/queues/.
import type { ConnectionOptions } from "bullmq";
import { Worker } from "bullmq";
import type { GoogleTaskJobPayload, GoogleTaskJobResult } from "./googleTask.js";
import {
  processGoogleTaskJob,
  type GoogleTasksJobProcessorDeps,
} from "./googleTasksJobProcessor.js";
import { jobLoggerFor } from "../../../../jobLogger.js";
import { Sentry } from "../../../../sentry.js";
import type { WorkerLogger } from "../../../../workerLogger.js";
import { GOOGLE_TASKS_QUEUE_NAME } from "./queue.js";

export interface CreateWorkerOptions {
  /** Throttles how fast this worker drains the queue (max jobs per `duration` ms) — added after a
   * real "quota exceeded" error from a burst of jobs hitting the Google Tasks API at once. */
  limiter?: { max: number; duration: number };
  /** Where "ready"/"failed" get logged — defaults to `console`; server.ts passes Fastify's
   * `app.log` instead, matching every other worker started in that process. */
  logger?: WorkerLogger;
}

export function createWorker(
  connection: ConnectionOptions,
  deps: GoogleTasksJobProcessorDeps,
  options: CreateWorkerOptions = {},
): Worker<GoogleTaskJobPayload, GoogleTaskJobResult> {
  const logger = options.logger ?? console;

  const worker = new Worker<GoogleTaskJobPayload, GoogleTaskJobResult>(
    GOOGLE_TASKS_QUEUE_NAME,
    async (job) => processGoogleTaskJob(job.data, { ...deps, log: jobLoggerFor(job) }),
    { connection, limiter: options.limiter },
  );

  worker.on("ready", () => {
    logger.info(`sync-google-tasks worker ready, consuming queue "${GOOGLE_TASKS_QUEUE_NAME}"`);
  });

  worker.on("failed", (job, error) => {
    logger.error(`Google Tasks sync job ${job?.id ?? "<unknown>"} failed: ${error}`);
    Sentry.captureException(error, { tags: { queue: GOOGLE_TASKS_QUEUE_NAME, jobId: job?.id } });
  });

  return worker;
}
