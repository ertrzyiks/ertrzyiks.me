// BullMQ wiring for the `extract-action-items` queue — the actual "fetch, extract, judge" logic
// lives in jobProcessor.ts, independent of BullMQ, so it can be unit-tested with fakes; this file
// is only the `Worker` construction and its `ready`/`failed` listeners, extracted out of the
// top-level worker.ts entrypoint so the queue/worker pairing matches every other queue under
// src/queues/.
import type { ConnectionOptions } from "bullmq";
import { Worker } from "bullmq";
import type { EmailJobPayload, EmailJobResult } from "./actionItem.js";
import { processEmailJob, type JobProcessorDeps } from "./jobProcessor.js";
import { jobLoggerFor } from "../../jobLogger.js";
import { Sentry } from "../../sentry.js";
import type { WorkerLogger } from "../workerLogger.js";
import { QUEUE_NAME } from "./queue.js";

export interface CreateWorkerOptions {
  /** Where "ready"/"failed" get logged — defaults to `console`, matching the Mac LaunchAgent
   * entrypoint's plain stdout/stderr logging (server.ts's cloud workers pass Fastify's `app.log`
   * instead, for the queues that run there). */
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
    { connection },
  );

  worker.on("ready", () => {
    logger.info(`task-manager worker ready, consuming queue "${QUEUE_NAME}"`);
  });

  worker.on("failed", (job, error) => {
    logger.error(`Job ${job?.id ?? "<unknown>"} failed:`, error);
    Sentry.captureException(error, { tags: { queue: QUEUE_NAME, jobId: job?.id } });
  });

  return worker;
}
