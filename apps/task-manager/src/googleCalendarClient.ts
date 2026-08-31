// Google Calendar client, shared by every queue that needs to create/update calendar events —
// originally written for the library-loan sync job (loanCalendarSync.ts) and reused as-is by
// calendarEventJobProcessor.ts (sync-calendar-events) once that queue needed the exact same
// create/update/delete/exists shape against the same "calendar.events" OAuth credential (#343).
// Kept at src/ top level (not under modules/loans/ where it started) because it's now shared
// across modules — see README's "Module and queue layout" section. Talks to real Google
// infrastructure so it can't be exercised in CI/sandbox — same situation as gmail.ts's
// createGmailFetcher (see that file's header comment). Each caller's own pure, unit-tested sync
// logic (loanCalendarSync.ts, calendarEventJobProcessor.ts) covers the actual sync decision
// against a fake CalendarClient instead.
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

export interface CalendarEventInput {
  summary: string;
  description: string;
  /** Naive local "YYYY-MM-DDTHH:mm:ss", interpreted in GoogleCalendarConfig.timeZone. */
  start: string;
  end: string;
}

export interface CalendarClient {
  /** Returns the new event's id. */
  createEvent(input: CalendarEventInput): Promise<string>;
  updateEvent(eventId: string, input: CalendarEventInput): Promise<void>;
  /** No-ops (rather than throwing) if the event is already gone — deleting a Calendar event
   * that's already deleted (e.g. by hand) isn't a sync failure. */
  deleteEvent(eventId: string): Promise<void>;
  /** False for a missing or cancelled event, rather than throwing — sync logic treats both the
   * same as "no event yet, make a new one". */
  eventExists(eventId: string): Promise<boolean>;
}

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId?: string;
  /** IANA zone the naive CalendarEventInput.start/end are interpreted in. Defaults to
   * "Europe/Warsaw" — this client's first caller (the library-loan sync) only ever served a
   * Polish library's return dates; every other caller passes its own zone. */
  timeZone?: string;
}

function isNotFoundError(error: unknown): boolean {
  const status =
    (error as { code?: number }).code ?? (error as { response?: { status?: number } }).response?.status;
  return status === 404 || status === 410;
}

export function createGoogleCalendarClient(config: GoogleCalendarConfig): CalendarClient {
  const oauth2Client = new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret });
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const calendarId = config.calendarId ?? "primary";
  const timeZone = config.timeZone ?? "Europe/Warsaw";

  function toRequestBody(input: CalendarEventInput) {
    return {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start, timeZone },
      end: { dateTime: input.end, timeZone },
    };
  }

  return {
    async createEvent(input) {
      const { data } = await calendar.events.insert({ calendarId, requestBody: toRequestBody(input) });
      if (!data.id) {
        throw new Error("Google Calendar did not return an event id after creating an event");
      }
      return data.id;
    },

    async updateEvent(eventId, input) {
      await calendar.events.patch({ calendarId, eventId, requestBody: toRequestBody(input) });
    },

    async deleteEvent(eventId) {
      try {
        await calendar.events.delete({ calendarId, eventId });
      } catch (error) {
        if (isNotFoundError(error)) return;
        throw error;
      }
    },

    async eventExists(eventId) {
      try {
        const { data } = await calendar.events.get({ calendarId, eventId });
        return data.status !== "cancelled";
      } catch (error) {
        if (isNotFoundError(error)) return false;
        throw error;
      }
    },
  };
}
