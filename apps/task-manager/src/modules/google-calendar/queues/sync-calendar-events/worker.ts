// BullMQ wiring for the `sync-calendar-events` queue — the actual "create one Google Calendar
// event" logic lives in calendarEventJobProcessor.ts, independent of BullMQ; this file is only
// the `Worker` construction, its rate limiter, and its `ready`/`failed` listeners — mirrors
// ../../../todoist/queues/sync-todoist/worker.ts exactly.
import type { ConnectionOptions } from "bullmq";
import { Worker } from "bullmq";
import type { CalendarEventJobPayload, CalendarEventJobResult } from "./calendarEvent.js";
import {
  processCalendarEventJob,
  type CalendarEventJobProcessorDeps,
} from "./calendarEventJobProcessor.js";
import { jobLoggerFor } from "../../../../jobLogger.js";
import { logConnectionErrors } from "../../../../redisResilience.js";
import { Sentry } from "../../../../sentry.js";
import type { WorkerLogger } from "../../../../workerLogger.js";
import { CALENDAR_EVENTS_QUEUE_NAME } from "./queue.js";

export interface CreateWorkerOptions {
  /** Throttles how fast this worker drains the queue (max jobs per `duration` ms) — same
   * quota-protection reasoning as sync-todoist's worker.ts. */
  limiter?: { max: number; duration: number };
  /** Where "ready"/"failed" get logged — defaults to `console`; server.ts passes Fastify's
   * `app.log` instead, matching every other worker started in that process. */
  logger?: WorkerLogger;
}

export function createWorker(
  connection: ConnectionOptions,
  deps: CalendarEventJobProcessorDeps,
  options: CreateWorkerOptions = {},
): Worker<CalendarEventJobPayload, CalendarEventJobResult> {
  const logger = options.logger ?? console;

  const worker = new Worker<CalendarEventJobPayload, CalendarEventJobResult>(
    CALENDAR_EVENTS_QUEUE_NAME,
    async (job) => processCalendarEventJob(job.data, { ...deps, log: jobLoggerFor(job) }),
    { connection, limiter: options.limiter },
  );

  worker.on("ready", () => {
    logger.info(`sync-calendar-events worker ready, consuming queue "${CALENDAR_EVENTS_QUEUE_NAME}"`);
  });

  worker.on("failed", (job, error) => {
    logger.error(`Calendar event sync job ${job?.id ?? "<unknown>"} failed: ${error}`);
    Sentry.captureException(error, { tags: { queue: CALENDAR_EVENTS_QUEUE_NAME, jobId: job?.id } });
  });

  // Keeps a Redis disconnect from crashing this process — see redisResilience.ts.
  logConnectionErrors(worker, `worker "${CALENDAR_EVENTS_QUEUE_NAME}"`, logger);

  return worker;
}
