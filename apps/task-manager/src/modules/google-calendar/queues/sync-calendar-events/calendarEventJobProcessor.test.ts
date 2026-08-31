import { describe, expect, it } from "vitest";
import type { EventEmitter, TrendEvent } from "../../../../axiomEvents.js";
import type { CalendarClient, CalendarEventInput } from "../../../../googleCalendarClient.js";
import { processCalendarEventJob } from "./calendarEventJobProcessor.js";
import type { CalendarEventJobPayload } from "./calendarEvent.js";

function recordingEmitter(): EventEmitter & { events: TrendEvent[] } {
  const events: TrendEvent[] = [];
  return { events, emit: (event) => events.push(event) };
}

function recordingLog(): { log: (message: string) => void; messages: string[] } {
  const messages: string[] = [];
  return { messages, log: (message) => messages.push(message) };
}

function fakeClient(id: string): CalendarClient & { calls: CalendarEventInput[] } {
  const calls: CalendarEventInput[] = [];
  return {
    calls,
    async createEvent(input) {
      calls.push(input);
      return id;
    },
    async updateEvent() {},
    async deleteEvent() {},
    async eventExists() {
      return true;
    },
  };
}

function failingClient(error: Error): CalendarClient {
  return {
    async createEvent() {
      throw error;
    },
    async updateEvent() {},
    async deleteEvent() {},
    async eventExists() {
      return true;
    },
  };
}

const PAYLOAD: CalendarEventJobPayload = {
  calendarEventId: 1,
  title: "Team offsite",
  description: "Quarterly offsite",
  date: "2026-09-10",
  startTime: "09:00",
  endTime: "17:00",
};

describe("processCalendarEventJob", () => {
  it("creates the Google Calendar event and returns the job result shape", async () => {
    const result = await processCalendarEventJob(PAYLOAD, { calendarClient: fakeClient("gcal-1") });

    expect(result).toEqual({ calendarEventId: 1, googleEventId: "gcal-1" });
  });

  it("maps title/description/date+time onto the calendar client's input shape", async () => {
    const calendarClient = fakeClient("gcal-1");

    await processCalendarEventJob(PAYLOAD, { calendarClient });

    expect(calendarClient.calls).toEqual([
      {
        summary: "Team offsite",
        description: "Quarterly offsite",
        start: "2026-09-10T09:00:00",
        end: "2026-09-10T17:00:00",
      },
    ]);
  });

  it("defaults to a one-hour duration when no endTime was extracted", async () => {
    const calendarClient = fakeClient("gcal-1");

    await processCalendarEventJob({ ...PAYLOAD, endTime: undefined }, { calendarClient });

    expect(calendarClient.calls).toEqual([
      expect.objectContaining({ start: "2026-09-10T09:00:00", end: "2026-09-10T10:00:00" }),
    ]);
  });

  it("rolls the default duration over into the next day when the start is late enough", async () => {
    const calendarClient = fakeClient("gcal-1");

    await processCalendarEventJob(
      { ...PAYLOAD, startTime: "23:30", endTime: undefined },
      { calendarClient },
    );

    expect(calendarClient.calls).toEqual([
      expect.objectContaining({ start: "2026-09-10T23:30:00", end: "2026-09-11T00:30:00" }),
    ]);
  });

  it("defaults to an empty description when none was extracted", async () => {
    const calendarClient = fakeClient("gcal-1");

    await processCalendarEventJob({ ...PAYLOAD, description: undefined }, { calendarClient });

    expect(calendarClient.calls).toEqual([expect.objectContaining({ description: "" })]);
  });

  it("propagates an error when the Google Calendar API call fails, so BullMQ can mark the job failed", async () => {
    const error = new Error("Google Calendar API error");

    await expect(
      processCalendarEventJob(PAYLOAD, { calendarClient: failingClient(error) }),
    ).rejects.toThrow("Google Calendar API error");
  });

  it("emits active then completed trend events, keyed by calendarEventId (#315)", async () => {
    const events = recordingEmitter();

    await processCalendarEventJob(PAYLOAD, { calendarClient: fakeClient("gcal-1"), events });

    expect(events.events).toEqual([
      { entity: "sync-calendar-events", entityId: "1", status: "active" },
      { entity: "sync-calendar-events", entityId: "1", status: "completed" },
    ]);
  });

  it("emits active then failed (with the error message) when the Google Calendar API call fails", async () => {
    const events = recordingEmitter();

    await expect(
      processCalendarEventJob(PAYLOAD, { calendarClient: failingClient(new Error("boom")), events }),
    ).rejects.toThrow();

    expect(events.events).toEqual([
      { entity: "sync-calendar-events", entityId: "1", status: "active" },
      { entity: "sync-calendar-events", entityId: "1", status: "failed", error: "boom" },
    ]);
  });

  it("doesn't throw when no events dep is given — defaults to a no-op", async () => {
    await expect(
      processCalendarEventJob(PAYLOAD, { calendarClient: fakeClient("gcal-1") }),
    ).resolves.toBeDefined();
  });

  it("leaves progress notes on success, for Bull Board's Logs tab (#348)", async () => {
    const { log, messages } = recordingLog();

    await processCalendarEventJob(PAYLOAD, { calendarClient: fakeClient("gcal-1"), log });

    expect(messages).toEqual([
      'Creating Google Calendar event "Team offsite"',
      "Created Google Calendar event gcal-1",
    ]);
  });

  it("leaves a failure progress note when the Google Calendar API call fails", async () => {
    const { log, messages } = recordingLog();

    await expect(
      processCalendarEventJob(PAYLOAD, { calendarClient: failingClient(new Error("boom")), log }),
    ).rejects.toThrow();

    expect(messages).toEqual(['Creating Google Calendar event "Team offsite"', "Failed: boom"]);
  });

  it("doesn't throw when no log dep is given — defaults to a no-op", async () => {
    await expect(
      processCalendarEventJob(PAYLOAD, { calendarClient: fakeClient("gcal-1") }),
    ).resolves.toBeDefined();
  });
});
