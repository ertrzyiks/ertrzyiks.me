import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  pollPendingGoogleTaskJobs,
  runGoogleTasksSyncCycle,
  scheduleUnsyncedActionItems,
} from "./googleTasksSyncer.js";
import type {
  GoogleTaskJobStatusResult,
  GoogleTaskPayload,
  JobStatusResult,
  JobsApiClient,
} from "./jobsApiClient.js";
import { createStore, type Store } from "./store.js";

class FakeJobsApiClient implements JobsApiClient {
  scheduledGoogleTaskItems: GoogleTaskPayload[] = [];
  googleTaskStatuses = new Map<string, GoogleTaskJobStatusResult>();
  private nextJobId = 1;
  scheduleShouldFailFor = new Set<number>();

  async scheduleJob(_emailId: string) {
    return { jobId: "unused" };
  }

  async getJobStatuses(_jobIds: string[]) {
    return [] as JobStatusResult[];
  }

  async scheduleGoogleTaskJob(item: GoogleTaskPayload) {
    this.scheduledGoogleTaskItems.push(item);
    if (this.scheduleShouldFailFor.has(item.actionItemId)) {
      throw new Error(`refused to schedule action item ${item.actionItemId}`);
    }
    const jobId = `gtask-job-${this.nextJobId++}`;
    this.googleTaskStatuses.set(jobId, { jobId, status: "pending" });
    return { jobId };
  }

  async getGoogleTaskJobStatuses(jobIds: string[]) {
    return jobIds
      .map((jobId) => this.googleTaskStatuses.get(jobId))
      .filter((status): status is GoogleTaskJobStatusResult => status !== undefined);
  }
}

describe("googleTasksSyncer", () => {
  let store: Store;

  beforeEach(() => {
    store = createStore(":memory:");
    store.insertQueuedEmail("email-1");
  });

  afterEach(() => {
    store.close();
  });

  describe("scheduleUnsyncedActionItems", () => {
    it("schedules a sync job for each action item without one and records the job id", async () => {
      store.markEmailCompleted("email-1", [
        { title: "Send the report", description: "Q3 report", dueDate: "2026-08-10" },
        { title: "Reply to Bob" },
      ]);
      const jobsApi = new FakeJobsApiClient();

      await scheduleUnsyncedActionItems({ jobsApi, store });

      expect(jobsApi.scheduledGoogleTaskItems).toEqual([
        { actionItemId: 1, title: "Send the report", description: "Q3 report", dueDate: "2026-08-10" },
        { actionItemId: 2, title: "Reply to Bob", description: undefined, dueDate: undefined },
      ]);
      expect(store.getActionItemsAwaitingTaskSync()).toEqual([
        { id: 1, jobId: "gtask-job-1" },
        { id: 2, jobId: "gtask-job-2" },
      ]);
    });

    it("does not reschedule an action item that already has a job id", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });

      await scheduleUnsyncedActionItems({ jobsApi, store });

      expect(jobsApi.scheduledGoogleTaskItems).toHaveLength(1);
    });

    it("leaves job_id unset (without throwing) when scheduling fails", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      jobsApi.scheduleShouldFailFor.add(1);

      await expect(scheduleUnsyncedActionItems({ jobsApi, store })).resolves.toBeUndefined();

      expect(store.getUnsyncedActionItems()).toEqual([
        { id: 1, title: "Send the report", description: null, dueDate: null },
      ]);
    });
  });

  describe("pollPendingGoogleTaskJobs", () => {
    it("does not call the Jobs API when nothing is pending", async () => {
      const jobsApi = new FakeJobsApiClient();
      let called = false;
      const original = jobsApi.getGoogleTaskJobStatuses.bind(jobsApi);
      jobsApi.getGoogleTaskJobStatuses = async (jobIds) => {
        called = true;
        return original(jobIds);
      };

      await pollPendingGoogleTaskJobs({ jobsApi, store });

      expect(called).toBe(false);
    });

    it("backfills task_id for a completed job", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });
      const [{ jobId }] = store.getActionItemsAwaitingTaskSync();
      jobsApi.googleTaskStatuses.set(jobId, {
        jobId,
        status: "completed",
        result: { actionItemId: 1, googleTaskId: "gtask-1" },
      });

      await pollPendingGoogleTaskJobs({ jobsApi, store });

      expect(store.getActionItemsAwaitingTaskSync()).toEqual([]);
    });

    it("leaves a failed job stuck (job_id set, task_id unset) without throwing", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });
      const [{ jobId }] = store.getActionItemsAwaitingTaskSync();
      jobsApi.googleTaskStatuses.set(jobId, { jobId, status: "failed", error: "Google Tasks API down" });

      await expect(pollPendingGoogleTaskJobs({ jobsApi, store })).resolves.toBeUndefined();

      expect(store.getActionItemsAwaitingTaskSync()).toEqual([{ id: 1, jobId }]);
      expect(store.getUnsyncedActionItems()).toEqual([]);
    });

    it("leaves pending/active jobs alone", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });
      const before = store.getActionItemsAwaitingTaskSync();

      await pollPendingGoogleTaskJobs({ jobsApi, store });

      expect(store.getActionItemsAwaitingTaskSync()).toEqual(before);
    });

    it("leaves an item pending when the Jobs API doesn't know its job id", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });
      jobsApi.googleTaskStatuses.clear(); // simulate the Jobs API forgetting the job

      await pollPendingGoogleTaskJobs({ jobsApi, store });

      expect(store.getActionItemsAwaitingTaskSync()).toHaveLength(1);
    });
  });

  describe("runGoogleTasksSyncCycle", () => {
    it("schedules then resolves a sync job end to end across two cycles", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();

      await runGoogleTasksSyncCycle({ jobsApi, store });
      const [{ jobId }] = store.getActionItemsAwaitingTaskSync();

      jobsApi.googleTaskStatuses.set(jobId, {
        jobId,
        status: "completed",
        result: { actionItemId: 1, googleTaskId: "gtask-1" },
      });
      await runGoogleTasksSyncCycle({ jobsApi, store });

      expect(store.getActionItemsAwaitingTaskSync()).toEqual([]);
      expect(store.getUnsyncedActionItems()).toEqual([]);
      // Re-running must not reschedule the now-synced item.
      expect(jobsApi.scheduledGoogleTaskItems).toHaveLength(1);
    });
  });
});
