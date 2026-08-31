// The `sync-calendar-events` queue: one job per extracted calendar event to push to Google
// Calendar, consumed by a `Worker` started alongside the Jobs API server in server.ts — mirrors
// ../../../google-tasks/queues/sync-google-tasks/queue.ts exactly, same "runs in the cloud, no
// Mac-local constraint" reasoning (pushing an already-extracted event has none of the "must never
// leave local processing" constraint that keeps Gmail content-reading on the Mac worker). Producer
// side is app.ts's `POST /calendar-event-jobs`; personal-assistant's sync loop
// (calendarEventSyncer.ts) is the only caller.
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { CalendarEventJobPayload } from "./calendarEvent.js";
import { DEFAULT_JOB_OPTIONS } from "../../../../retry.js";

export const CALENDAR_EVENTS_QUEUE_NAME = "sync-calendar-events";

// `defaultJobOptions` (#348) — see retry.ts for the shared policy every queue in this app applies.
export function createQueue(redisUrl: string): Queue<CalendarEventJobPayload> {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue(CALENDAR_EVENTS_QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}

// Mirrors ../../google-tasks/queues/sync-google-tasks/queue.ts's GoogleTaskJobLike/
// GoogleTasksJobsQueue, typed to the sync-calendar-events payload instead — kept as a separate
// small interface (rather than a generic JobsQueue<T>) to match this codebase's existing
// per-queue file convention.
export interface CalendarEventJobLike {
  id?: string;
  getState(): Promise<string>;
  returnvalue: unknown;
  failedReason?: string;
}

export interface CalendarEventJobsQueue {
  add(name: string, data: CalendarEventJobPayload): Promise<{ id?: string }>;
  getJob(jobId: string): Promise<CalendarEventJobLike | undefined>;
}
