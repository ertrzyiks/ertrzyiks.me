// Shared job payload/result types for the `extract-action-items` queue.
// `worker.ts` (this package's consumer) and `queue.ts`/`app.ts` (the producer/Jobs
// API side) import these directly rather than duplicating the shape — see #241 for
// the wire contract these mirror.

export interface ActionItem {
  title: string;
  description: string;
  dueDate: string | null;
}

// A calendar-worthy event mentioned in an email (an appointment, a meeting, a deadline with a
// specific time) as opposed to an ActionItem, which is a task the receiver needs to do with no
// fixed slot on the calendar. `date`/`startTime`/`endTime` are kept separate (rather than one
// combined datetime) so the extraction schema can constrain each independently — see
// openRouter.ts's OUTPUT_FORMAT_INSTRUCTIONS. `date`/`startTime` are both required — an event with no
// known start time isn't extracted at all (see extractActionItems.system.md's Phase 3), so there
// is no "day only" event to represent. `endTime` stays nullable: a real duration/end time is
// nice-to-have, not something worth guessing when the email doesn't state one. A later phase (not
// this one) turns a kept event into an actual Google Calendar entry — see
// src/modules/loans/googleCalendar.ts's CalendarEventInput for the closest existing precedent of
// that shape.
export interface CalendarEvent {
  title: string;
  description: string;
  /** ISO 8601 `yyyy-mm-dd`. */
  date: string;
  /** ISO 8601 `HH:mm`. Required — see the header comment above. */
  startTime: string;
  /** ISO 8601 `HH:mm`, or null when the email doesn't state an end time/duration. */
  endTime: string | null;
}

export interface EmailJobPayload {
  emailId: string;
}

export interface EmailJobResult {
  emailId: string;
  actionItems: ActionItem[];
  events: CalendarEvent[];
}
