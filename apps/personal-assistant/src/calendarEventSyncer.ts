// The calendar-event counterpart to googleTasksSyncer.ts — same shape (schedule what's unsynced,
// then poll and backfill what's finished), pointed at the sync-calendar-events queue and
// calendar_events table instead of sync-google-tasks and action_items. See that file for the
// design rationale this mirrors.
import type { JobsApiClient } from "./jobsApiClient.js";
import { noopLogger, type Logger } from "./logger.js";
import type { Store } from "./store.js";

export interface CalendarEventSyncDeps {
  jobsApi: JobsApiClient;
  store: Store;
  logger?: Logger;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Schedules a sync-calendar-events job for every calendar event that doesn't have one yet
 * (`job_id IS NULL`), and stores the returned job ID.
 *
 * Same deferred-retry stance as scheduleUnsyncedActionItems in googleTasksSyncer.ts: a scheduling
 * failure here is not recorded anywhere terminal — `job_id` is simply left `NULL` so the item is
 * retried next cycle.
 */
export async function scheduleUnsyncedCalendarEvents(deps: CalendarEventSyncDeps): Promise<void> {
  const { jobsApi, store, logger = noopLogger } = deps;

  const events = store.getUnsyncedCalendarEvents();

  for (const event of events) {
    try {
      const { jobId } = await jobsApi.scheduleCalendarEventJob({
        calendarEventId: event.id,
        title: event.title,
        description: event.description ?? undefined,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime ?? undefined,
      });
      store.setCalendarEventJobId(event.id, jobId);
      logger.info(`scheduled calendar event sync job ${jobId} for calendar event ${event.id}`);
    } catch (err) {
      logger.error(
        `failed to schedule calendar event sync job for calendar event ${event.id}: ${errorMessage(err)}`,
      );
    }
  }
}

/**
 * Polls the Jobs API for the status of every calendar event with a sync job scheduled but not yet
 * backfilled (`job_id` set, `google_event_id IS NULL`), and stores the outcome: `google_event_id`
 * on success. A failed job is logged and left stuck (same deferred-retry stance as
 * pollPendingGoogleTaskJobs) — still-pending/active jobs are left untouched either way.
 */
export async function pollPendingCalendarEventJobs(deps: CalendarEventSyncDeps): Promise<void> {
  const { jobsApi, store, logger = noopLogger } = deps;

  const pending = store.getCalendarEventsAwaitingSync();
  if (pending.length === 0) return;

  const statuses = await jobsApi.getCalendarEventJobStatuses(pending.map((event) => event.jobId));
  const statusByJobId = new Map(statuses.map((status) => [status.jobId, status]));

  for (const { id, jobId } of pending) {
    const status = statusByJobId.get(jobId);
    if (!status) continue; // Unknown to the Jobs API — leave pending, try again next cycle.

    if (status.status === "completed" && status.result) {
      store.setCalendarEventGoogleEventId(id, status.result.googleEventId);
      logger.info(`calendar event ${id} synced to Google Calendar as ${status.result.googleEventId}`);
    } else if (status.status === "failed") {
      logger.warn(
        `calendar event sync job ${jobId} for calendar event ${id} failed: ${status.error ?? "unknown error"}`,
      );
    }
    // pending/active: no-op, check again next cycle.
  }
}

export async function runCalendarEventSyncCycle(deps: CalendarEventSyncDeps): Promise<void> {
  await scheduleUnsyncedCalendarEvents(deps);
  await pollPendingCalendarEventJobs(deps);
}
