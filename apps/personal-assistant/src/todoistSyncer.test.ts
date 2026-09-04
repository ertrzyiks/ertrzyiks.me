import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  pollPendingTodoistJobs,
  runTodoistSyncCycle,
  scheduleUnsyncedActionItems,
} from "./todoistSyncer.js";
import type {
  CalendarEventJobPayload,
  CalendarEventJobStatusResult,
  TodoistJobStatusResult,
  TodoistPayload,
  JobStatusResult,
  JobsApiClient,
} from "./jobsApiClient.js";
import { createStore, type Store } from "./store.js";

class FakeJobsApiClient implements JobsApiClient {
  scheduledTodoistItems: TodoistPayload[] = [];
  todoistStatuses = new Map<string, TodoistJobStatusResult>();
  private nextJobId = 1;
  scheduleShouldFailFor = new Set<number>();

  async scheduleJob(_emailId: string) {
    return { jobId: "unused" };
  }

  async getJobStatuses(_jobIds: string[]) {
    return [] as JobStatusResult[];
  }

  async scheduleTodoistJob(item: TodoistPayload) {
    this.scheduledTodoistItems.push(item);
    if (this.scheduleShouldFailFor.has(item.actionItemId)) {
      throw new Error(`refused to schedule action item ${item.actionItemId}`);
    }
    const jobId = `todoist-job-${this.nextJobId++}`;
    this.todoistStatuses.set(jobId, { jobId, status: "pending" });
    return { jobId };
  }

  async getTodoistJobStatuses(jobIds: string[]) {
    return jobIds
      .map((jobId) => this.todoistStatuses.get(jobId))
      .filter((status): status is TodoistJobStatusResult => status !== undefined);
  }

  async scheduleCalendarEventJob(_item: CalendarEventJobPayload) {
    return { jobId: "unused" };
  }

  async getCalendarEventJobStatuses(_jobIds: string[]) {
    return [] as CalendarEventJobStatusResult[];
  }
}

describe("todoistSyncer", () => {
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

      expect(jobsApi.scheduledTodoistItems).toEqual([
        { actionItemId: 1, title: "Send the report", description: "Q3 report", dueDate: "2026-08-10" },
        { actionItemId: 2, title: "Reply to Bob", description: undefined, dueDate: undefined },
      ]);
      expect(store.getActionItemsAwaitingTaskSync()).toEqual([
        { id: 1, jobId: "todoist-job-1" },
        { id: 2, jobId: "todoist-job-2" },
      ]);
    });

    it("does not reschedule an action item that already has a job id", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });

      await scheduleUnsyncedActionItems({ jobsApi, store });

      expect(jobsApi.scheduledTodoistItems).toHaveLength(1);
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

  describe("pollPendingTodoistJobs", () => {
    it("does not call the Jobs API when nothing is pending", async () => {
      const jobsApi = new FakeJobsApiClient();
      let called = false;
      const original = jobsApi.getTodoistJobStatuses.bind(jobsApi);
      jobsApi.getTodoistJobStatuses = async (jobIds) => {
        called = true;
        return original(jobIds);
      };

      await pollPendingTodoistJobs({ jobsApi, store });

      expect(called).toBe(false);
    });

    it("backfills task_id for a completed job", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });
      const [{ jobId }] = store.getActionItemsAwaitingTaskSync();
      jobsApi.todoistStatuses.set(jobId, {
        jobId,
        status: "completed",
        result: { actionItemId: 1, todoistTaskId: "todoist-1" },
      });

      await pollPendingTodoistJobs({ jobsApi, store });

      expect(store.getActionItemsAwaitingTaskSync()).toEqual([]);
    });

    it("leaves a failed job stuck (job_id set, task_id unset) without throwing", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });
      const [{ jobId }] = store.getActionItemsAwaitingTaskSync();
      jobsApi.todoistStatuses.set(jobId, { jobId, status: "failed", error: "Todoist API down" });

      await expect(pollPendingTodoistJobs({ jobsApi, store })).resolves.toBeUndefined();

      expect(store.getActionItemsAwaitingTaskSync()).toEqual([{ id: 1, jobId }]);
      expect(store.getUnsyncedActionItems()).toEqual([]);
    });

    it("leaves pending/active jobs alone", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });
      const before = store.getActionItemsAwaitingTaskSync();

      await pollPendingTodoistJobs({ jobsApi, store });

      expect(store.getActionItemsAwaitingTaskSync()).toEqual(before);
    });

    it("leaves an item pending when the Jobs API doesn't know its job id", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();
      await scheduleUnsyncedActionItems({ jobsApi, store });
      jobsApi.todoistStatuses.clear(); // simulate the Jobs API forgetting the job

      await pollPendingTodoistJobs({ jobsApi, store });

      expect(store.getActionItemsAwaitingTaskSync()).toHaveLength(1);
    });
  });

  describe("runTodoistSyncCycle", () => {
    it("schedules then resolves a sync job end to end across two cycles", async () => {
      store.markEmailCompleted("email-1", [{ title: "Send the report" }]);
      const jobsApi = new FakeJobsApiClient();

      await runTodoistSyncCycle({ jobsApi, store });
      const [{ jobId }] = store.getActionItemsAwaitingTaskSync();

      jobsApi.todoistStatuses.set(jobId, {
        jobId,
        status: "completed",
        result: { actionItemId: 1, todoistTaskId: "todoist-1" },
      });
      await runTodoistSyncCycle({ jobsApi, store });

      expect(store.getActionItemsAwaitingTaskSync()).toEqual([]);
      expect(store.getUnsyncedActionItems()).toEqual([]);
      // Re-running must not reschedule the now-synced item.
      expect(jobsApi.scheduledTodoistItems).toHaveLength(1);
    });
  });
});
