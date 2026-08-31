import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  pollPendingCalendarEventJobs,
  runCalendarEventSyncCycle,
  scheduleUnsyncedCalendarEvents,
} from "./calendarEventSyncer.js";
import type {
  CalendarEventJobPayload,
  CalendarEventJobStatusResult,
  GoogleTaskJobStatusResult,
  JobStatusResult,
  JobsApiClient,
} from "./jobsApiClient.js";
import { createStore, type Store } from "./store.js";

class FakeJobsApiClient implements JobsApiClient {
  scheduledCalendarEventItems: CalendarEventJobPayload[] = [];
  calendarEventStatuses = new Map<string, CalendarEventJobStatusResult>();
  private nextJobId = 1;
  scheduleShouldFailFor = new Set<number>();

  async scheduleJob(_emailId: string) {
    return { jobId: "unused" };
  }

  async getJobStatuses(_jobIds: string[]) {
    return [] as JobStatusResult[];
  }

  async scheduleGoogleTaskJob() {
    return { jobId: "unused" };
  }

  async getGoogleTaskJobStatuses(_jobIds: string[]) {
    return [] as GoogleTaskJobStatusResult[];
  }

  async scheduleCalendarEventJob(item: CalendarEventJobPayload) {
    this.scheduledCalendarEventItems.push(item);
    if (this.scheduleShouldFailFor.has(item.calendarEventId)) {
      throw new Error(`refused to schedule calendar event ${item.calendarEventId}`);
    }
    const jobId = `gcal-job-${this.nextJobId++}`;
    this.calendarEventStatuses.set(jobId, { jobId, status: "pending" });
    return { jobId };
  }

  async getCalendarEventJobStatuses(jobIds: string[]) {
    return jobIds
      .map((jobId) => this.calendarEventStatuses.get(jobId))
      .filter((status): status is CalendarEventJobStatusResult => status !== undefined);
  }
}

describe("calendarEventSyncer", () => {
  let store: Store;

  beforeEach(() => {
    store = createStore(":memory:");
    store.insertQueuedEmail("email-1");
  });

  afterEach(() => {
    store.close();
  });

  describe("scheduleUnsyncedCalendarEvents", () => {
    it("schedules a sync job for each calendar event without one and records the job id", async () => {
      store.markEmailCompleted(
        "email-1",
        [],
        [
          { title: "Team offsite", description: "Quarterly offsite", date: "2026-09-10", startTime: "09:00", endTime: "17:00" },
          { title: "Dentist", date: "2026-09-12", startTime: "10:00" },
        ],
      );
      const jobsApi = new FakeJobsApiClient();

      await scheduleUnsyncedCalendarEvents({ jobsApi, store });

      expect(jobsApi.scheduledCalendarEventItems).toEqual([
        {
          calendarEventId: 1,
          title: "Team offsite",
          description: "Quarterly offsite",
          date: "2026-09-10",
          startTime: "09:00",
          endTime: "17:00",
        },
        {
          calendarEventId: 2,
          title: "Dentist",
          description: undefined,
          date: "2026-09-12",
          startTime: "10:00",
          endTime: undefined,
        },
      ]);
      expect(store.getCalendarEventsAwaitingSync()).toEqual([
        { id: 1, jobId: "gcal-job-1" },
        { id: 2, jobId: "gcal-job-2" },
      ]);
    });

    it("does not reschedule a calendar event that already has a job id", async () => {
      store.markEmailCompleted("email-1", [], [{ title: "Team offsite", date: "2026-09-10", startTime: "09:00" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedCalendarEvents({ jobsApi, store });

      await scheduleUnsyncedCalendarEvents({ jobsApi, store });

      expect(jobsApi.scheduledCalendarEventItems).toHaveLength(1);
    });

    it("leaves job_id unset (without throwing) when scheduling fails", async () => {
      store.markEmailCompleted("email-1", [], [{ title: "Team offsite", date: "2026-09-10", startTime: "09:00" }]);
      const jobsApi = new FakeJobsApiClient();
      jobsApi.scheduleShouldFailFor.add(1);

      await expect(scheduleUnsyncedCalendarEvents({ jobsApi, store })).resolves.toBeUndefined();

      expect(store.getUnsyncedCalendarEvents()).toEqual([
        { id: 1, title: "Team offsite", description: null, date: "2026-09-10", startTime: "09:00", endTime: null },
      ]);
    });
  });

  describe("pollPendingCalendarEventJobs", () => {
    it("does not call the Jobs API when nothing is pending", async () => {
      const jobsApi = new FakeJobsApiClient();
      let called = false;
      const original = jobsApi.getCalendarEventJobStatuses.bind(jobsApi);
      jobsApi.getCalendarEventJobStatuses = async (jobIds) => {
        called = true;
        return original(jobIds);
      };

      await pollPendingCalendarEventJobs({ jobsApi, store });

      expect(called).toBe(false);
    });

    it("backfills google_event_id for a completed job", async () => {
      store.markEmailCompleted("email-1", [], [{ title: "Team offsite", date: "2026-09-10", startTime: "09:00" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedCalendarEvents({ jobsApi, store });
      const [{ jobId }] = store.getCalendarEventsAwaitingSync();
      jobsApi.calendarEventStatuses.set(jobId, {
        jobId,
        status: "completed",
        result: { calendarEventId: 1, googleEventId: "gcal-1" },
      });

      await pollPendingCalendarEventJobs({ jobsApi, store });

      expect(store.getCalendarEventsAwaitingSync()).toEqual([]);
    });

    it("leaves a failed job stuck (job_id set, google_event_id unset) without throwing", async () => {
      store.markEmailCompleted("email-1", [], [{ title: "Team offsite", date: "2026-09-10", startTime: "09:00" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedCalendarEvents({ jobsApi, store });
      const [{ jobId }] = store.getCalendarEventsAwaitingSync();
      jobsApi.calendarEventStatuses.set(jobId, { jobId, status: "failed", error: "Google Calendar API down" });

      await expect(pollPendingCalendarEventJobs({ jobsApi, store })).resolves.toBeUndefined();

      expect(store.getCalendarEventsAwaitingSync()).toEqual([{ id: 1, jobId }]);
      expect(store.getUnsyncedCalendarEvents()).toEqual([]);
    });

    it("leaves pending/active jobs alone", async () => {
      store.markEmailCompleted("email-1", [], [{ title: "Team offsite", date: "2026-09-10", startTime: "09:00" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedCalendarEvents({ jobsApi, store });
      const before = store.getCalendarEventsAwaitingSync();

      await pollPendingCalendarEventJobs({ jobsApi, store });

      expect(store.getCalendarEventsAwaitingSync()).toEqual(before);
    });

    it("leaves an item pending when the Jobs API doesn't know its job id", async () => {
      store.markEmailCompleted("email-1", [], [{ title: "Team offsite", date: "2026-09-10", startTime: "09:00" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedCalendarEvents({ jobsApi, store });
      jobsApi.calendarEventStatuses.clear(); // simulate the Jobs API forgetting the job

      await pollPendingCalendarEventJobs({ jobsApi, store });

      expect(store.getCalendarEventsAwaitingSync()).toHaveLength(1);
    });
  });

  describe("runCalendarEventSyncCycle", () => {
    it("schedules then resolves a sync job end to end across two cycles", async () => {
      store.markEmailCompleted("email-1", [], [{ title: "Team offsite", date: "2026-09-10", startTime: "09:00" }]);
      const jobsApi = new FakeJobsApiClient();

      await runCalendarEventSyncCycle({ jobsApi, store });
      const [{ jobId }] = store.getCalendarEventsAwaitingSync();

      jobsApi.calendarEventStatuses.set(jobId, {
        jobId,
        status: "completed",
        result: { calendarEventId: 1, googleEventId: "gcal-1" },
      });
      await runCalendarEventSyncCycle({ jobsApi, store });

      expect(store.getCalendarEventsAwaitingSync()).toEqual([]);
      expect(store.getUnsyncedCalendarEvents()).toEqual([]);
      // Re-running must not reschedule the now-synced item.
      expect(jobsApi.scheduledCalendarEventItems).toHaveLength(1);
    });
  });
});
