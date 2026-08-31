// Shared job payload/result types for the `sync-calendar-events` queue — mirrors
// google-tasks/queues/sync-google-tasks/googleTask.ts's role for that queue.
// `calendarEventJobProcessor.ts` (this package's consumer) and `app.ts` (the producer/Jobs API
// side) import these directly. Field names mirror actionItem.ts's `CalendarEvent` (the extraction
// result personal-assistant reads a row of this payload from) rather than reusing that type
// outright, same as `GoogleTaskJobPayload` mirrors `ActionItem` instead of importing it.

export interface CalendarEventJobPayload {
  calendarEventId: number;
  title: string;
  description?: string;
  /** ISO 8601 `yyyy-mm-dd`. */
  date: string;
  /** ISO 8601 `HH:mm`. */
  startTime: string;
  /** ISO 8601 `HH:mm`. Omitted when the source event had no end time — see
   * calendarEventJobProcessor.ts's default-duration fallback. */
  endTime?: string;
}

export interface CalendarEventJobResult {
  calendarEventId: number;
  googleEventId: string;
}
