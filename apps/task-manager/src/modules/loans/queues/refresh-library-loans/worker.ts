// BullMQ wiring for the `refresh-library-loans` queue — the actual "check WBPG, replace the
// snapshot, fan out per-loan jobs" logic lives in libraryRefresh.ts, independent of BullMQ; this
// file is only the `Worker` construction and its `ready`/`failed` listeners, extracted out of
// server.ts so the queue/worker pairing matches every other queue under src/modules/*/queues/.
import type { ConnectionOptions } from "bullmq";
import { Worker } from "bullmq";
import { refreshLibraryLoans, type LibraryRefreshDeps } from "./libraryRefresh.js";
import { jobLoggerFor } from "../../../../jobLogger.js";
import { Sentry } from "../../../../sentry.js";
import type { WorkerLogger } from "../../../../workerLogger.js";
import { LIBRARY_REFRESH_QUEUE_NAME } from "./queue.js";

export interface CreateWorkerOptions {
  /** Where "ready"/"failed"/the per-run summary get logged — defaults to `console`; server.ts
   * passes Fastify's `app.log` instead, matching every other worker started in that process. */
  logger?: WorkerLogger;
}

export function createWorker(
  connection: ConnectionOptions,
  deps: LibraryRefreshDeps,
  options: CreateWorkerOptions = {},
): Worker {
  const logger = options.logger ?? console;

  const worker = new Worker(
    LIBRARY_REFRESH_QUEUE_NAME,
    async (job) => {
      const result = await refreshLibraryLoans({ ...deps, log: jobLoggerFor(job) });
      logger.info(
        `library refresh: ${result.loanCount} current loan(s), ` +
          `${result.removedCalendarEventGroups} stale calendar event group(s) removed`,
      );
    },
    { connection },
  );

  worker.on("ready", () => {
    logger.info(`library sync worker ready, consuming "${LIBRARY_REFRESH_QUEUE_NAME}"`);
  });

  worker.on("failed", (job, error) => {
    logger.error(`Library sync job ${job?.id ?? "<unknown>"} on "${LIBRARY_REFRESH_QUEUE_NAME}" failed: ${error}`);
    Sentry.captureException(error, { tags: { queue: LIBRARY_REFRESH_QUEUE_NAME, jobId: job?.id } });
  });

  return worker;
}
