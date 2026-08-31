// BullMQ wiring for the `sync-loan-calendar` queue — the actual "sync one loan's Google Calendar
// event" logic lives in loanCalendarSync.ts, independent of BullMQ; this file is only the
// `Worker` construction and its `ready`/`failed` listeners, extracted out of server.ts so the
// queue/worker pairing matches every other queue under src/modules/*/queues/.
import type { ConnectionOptions } from "bullmq";
import { Worker } from "bullmq";
import { syncLoanCalendarEvent, type LoanCalendarSyncDeps } from "./loanCalendarSync.js";
import { jobLoggerFor } from "../../../../jobLogger.js";
import { logConnectionErrors } from "../../../../redisResilience.js";
import { Sentry } from "../../../../sentry.js";
import type { WorkerLogger } from "../../../../workerLogger.js";
import { LIBRARY_SYNC_QUEUE_NAME, type LoanSyncJobPayload } from "./queue.js";

export interface CreateWorkerOptions {
  /** Where "ready"/"failed" get logged — defaults to `console`; server.ts passes Fastify's
   * `app.log` instead, matching every other worker started in that process. */
  logger?: WorkerLogger;
}

export function createWorker(
  connection: ConnectionOptions,
  deps: LoanCalendarSyncDeps,
  options: CreateWorkerOptions = {},
): Worker<LoanSyncJobPayload> {
  const logger = options.logger ?? console;

  const worker = new Worker<LoanSyncJobPayload>(
    LIBRARY_SYNC_QUEUE_NAME,
    async (job) => {
      await syncLoanCalendarEvent(job.data.holdingId, { ...deps, log: jobLoggerFor(job) });
    },
    { connection },
  );

  worker.on("ready", () => {
    logger.info(`library sync worker ready, consuming "${LIBRARY_SYNC_QUEUE_NAME}"`);
  });

  worker.on("failed", (job, error) => {
    logger.error(`Library sync job ${job?.id ?? "<unknown>"} on "${LIBRARY_SYNC_QUEUE_NAME}" failed: ${error}`);
    Sentry.captureException(error, { tags: { queue: LIBRARY_SYNC_QUEUE_NAME, jobId: job?.id } });
  });

  // Keeps a Redis disconnect from crashing this process — see redisResilience.ts.
  logConnectionErrors(worker, `worker "${LIBRARY_SYNC_QUEUE_NAME}"`, logger);

  return worker;
}
