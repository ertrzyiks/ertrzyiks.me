// The actual "handle one sync job" logic, independent of BullMQ — mirrors
// google-tasks/queues/sync-google-tasks/googleTasksJobProcessor.ts. server.ts wraps this in a
// `Worker` processor callback for the `sync-calendar-events` queue; tests call it directly with a
// fake `CalendarClient`.
import { noopEventEmitter, type EventEmitter } from "../../../../axiomEvents.js";
import type { CalendarClient } from "../../../../googleCalendarClient.js";
import type { CalendarEventJobPayload, CalendarEventJobResult } from "./calendarEvent.js";
import { noopJobLogger, type JobLogger } from "../../../../jobLogger.js";

export interface CalendarEventJobProcessorDeps {
  calendarClient: CalendarClient;
  /** Trend-event emission (#315) — optional, defaults to a no-op so existing callers/tests are
   * unaffected by omitting it. */
  events?: EventEmitter;
  /** Bull Board per-job progress notes (#348) — optional, defaults to a no-op. */
  log?: JobLogger;
}

// A Google Calendar event needs both a start *and* an end — there's no such thing as an
// open-ended one via this API. `startTime` is guaranteed on the payload (extraction never emits
// an event without one, see extractActionItems.system.md's Phase 3), but `endTime` is only ever
// present when the source email actually stated one, so a fallback duration is needed when it
// isn't. An hour is a plain, easy-to-explain default for "some appointment/meeting with no stated
// length" — not a measured value, just a reasonable placeholder; tune here if it turns out wrong
// in practice.
const DEFAULT_EVENT_DURATION_MINUTES = 60;

function toNaiveDateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

// Adds the default duration to a naive local "date + HH:mm" pair, returning another naive
// "YYYY-MM-DDTHH:mm:ss" string in the same (unspecified) local time. Parsed with a trailing `Z`
// purely so `Date` handles minute/hour/day rollover correctly (e.g. a 23:30 start correctly rolls
// into the next calendar day) — that `Z` is stripped back off before returning, so the result is
// still a naive, no-offset string, exactly the shape googleCalendarClient.ts's CalendarEventInput
// expects (it applies GoogleCalendarConfig.timeZone itself; doing the arithmetic in real UTC here
// would double-apply an offset).
function addDefaultDuration(date: string, startTime: string): string {
  const start = new Date(`${toNaiveDateTime(date, startTime)}Z`);
  const end = new Date(start.getTime() + DEFAULT_EVENT_DURATION_MINUTES * 60_000);
  return end.toISOString().slice(0, 19);
}

// Throws on any failure so BullMQ marks the job `failed` with that error as `failedReason` —
// matching the Jobs API contract used for extract-action-items/sync-google-tasks.
export async function processCalendarEventJob(
  payload: CalendarEventJobPayload,
  deps: CalendarEventJobProcessorDeps,
): Promise<CalendarEventJobResult> {
  const events = deps.events ?? noopEventEmitter;
  const log = deps.log ?? noopJobLogger;
  const entity = "sync-calendar-events";
  const entityId = String(payload.calendarEventId);

  events.emit({ entity, entityId, status: "active" });
  log(`Creating Google Calendar event "${payload.title}"`);
  try {
    const eventId = await deps.calendarClient.createEvent({
      summary: payload.title,
      description: payload.description ?? "",
      start: toNaiveDateTime(payload.date, payload.startTime),
      end: payload.endTime
        ? toNaiveDateTime(payload.date, payload.endTime)
        : addDefaultDuration(payload.date, payload.startTime),
    });

    log(`Created Google Calendar event ${eventId}`);
    events.emit({ entity, entityId, status: "completed" });
    return { calendarEventId: payload.calendarEventId, googleEventId: eventId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed: ${message}`);
    events.emit({ entity, entityId, status: "failed", error: message });
    throw error;
  }
}
