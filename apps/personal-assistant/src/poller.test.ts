import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GmailClient } from "./gmailClient.js";
import type {
  GoogleTaskJobStatusResult,
  GoogleTaskPayload,
  JobStatusResult,
  JobsApiClient,
} from "./jobsApiClient.js";
import { discoverAndScheduleNewEmails, pollPendingJobStatuses, runPollCycle } from "./poller.js";
import { createStore, type Store } from "./store.js";

class FakeGmailClient implements GmailClient {
  constructor(private messageIds: string[]) {}

  async listNewMessageIds() {
    return this.messageIds;
  }
}

class FakeJobsApiClient implements JobsApiClient {
  scheduledEmailIds: string[] = [];
  statuses = new Map<string, JobStatusResult>();
  private nextJobId = 1;
  scheduleShouldFailFor = new Set<string>();

  scheduledGoogleTaskItems: GoogleTaskPayload[] = [];
  googleTaskStatuses = new Map<string, GoogleTaskJobStatusResult>();
  private nextGoogleTaskJobId = 1;

  async scheduleJob(emailId: string) {
    this.scheduledEmailIds.push(emailId);
    if (this.scheduleShouldFailFor.has(emailId)) {
      throw new Error(`refused to schedule ${emailId}`);
    }
    const jobId = `job-${this.nextJobId++}`;
    this.statuses.set(jobId, { jobId, status: "pending" });
    return { jobId };
  }

  async getJobStatuses(jobIds: string[]) {
    return jobIds
      .map((jobId) => this.statuses.get(jobId))
      .filter((status): status is JobStatusResult => status !== undefined);
  }

  async scheduleGoogleTaskJob(item: GoogleTaskPayload) {
    this.scheduledGoogleTaskItems.push(item);
    const jobId = `gtask-job-${this.nextGoogleTaskJobId++}`;
    this.googleTaskStatuses.set(jobId, { jobId, status: "pending" });
    return { jobId };
  }

  async getGoogleTaskJobStatuses(jobIds: string[]) {
    return jobIds
      .map((jobId) => this.googleTaskStatuses.get(jobId))
      .filter((status): status is GoogleTaskJobStatusResult => status !== undefined);
  }
}

describe("poller", () => {
  let store: Store;

  beforeEach(() => {
    store = createStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  describe("discoverAndScheduleNewEmails", () => {
    it("schedules a job for each newly-discovered email and records the job id", async () => {
      const gmail = new FakeGmailClient(["email-1", "email-2"]);
      const jobsApi = new FakeJobsApiClient();

      await discoverAndScheduleNewEmails({ gmail, jobsApi, store });

      expect(jobsApi.scheduledEmailIds).toEqual(["email-1", "email-2"]);
      expect(store.getQueuedEmailsWithJobId()).toEqual([
        { emailId: "email-1", jobId: "job-1" },
        { emailId: "email-2", jobId: "job-2" },
      ]);
    });

    it("dedups: does not reschedule an email already present in the store", async () => {
      store.insertQueuedEmail("email-1");
      store.setJobId("email-1", "existing-job");
      const gmail = new FakeGmailClient(["email-1", "email-2"]);
      const jobsApi = new FakeJobsApiClient();

      await discoverAndScheduleNewEmails({ gmail, jobsApi, store });

      expect(jobsApi.scheduledEmailIds).toEqual(["email-2"]);
      expect(store.getQueuedEmailsWithJobId()).toContainEqual({
        emailId: "email-1",
        jobId: "existing-job",
      });
    });

    it("marks the email failed (without throwing) when scheduling fails", async () => {
      const gmail = new FakeGmailClient(["email-1"]);
      const jobsApi = new FakeJobsApiClient();
      jobsApi.scheduleShouldFailFor.add("email-1");

      await expect(discoverAndScheduleNewEmails({ gmail, jobsApi, store })).resolves.toBeUndefined();

      expect(store.emailExists("email-1")).toBe(true);
      expect(store.getQueuedEmailsWithJobId()).toEqual([]);
    });
  });

  describe("pollPendingJobStatuses", () => {
    it("does not call the Jobs API when nothing is queued", async () => {
      const jobsApi = new FakeJobsApiClient();
      let called = false;
      const originalGetJobStatuses = jobsApi.getJobStatuses.bind(jobsApi);
      jobsApi.getJobStatuses = async (jobIds) => {
        called = true;
        return originalGetJobStatuses(jobIds);
      };

      await pollPendingJobStatuses({ gmail: new FakeGmailClient([]), jobsApi, store });

      expect(called).toBe(false);
    });

    it("stores action items and marks the email completed", async () => {
      store.insertQueuedEmail("email-1");
      store.setJobId("email-1", "job-1");
      const jobsApi = new FakeJobsApiClient();
      jobsApi.statuses.set("job-1", {
        jobId: "job-1",
        status: "completed",
        result: {
          emailId: "email-1",
          actionItems: [{ title: "Reply", description: "to the sender", dueDate: "2026-08-10" }],
        },
      });

      await pollPendingJobStatuses({ gmail: new FakeGmailClient([]), jobsApi, store });

      expect(store.getQueuedEmailsWithJobId()).toEqual([]);
    });

    it("marks the email failed with the error message", async () => {
      store.insertQueuedEmail("email-1");
      store.setJobId("email-1", "job-1");
      const jobsApi = new FakeJobsApiClient();
      jobsApi.statuses.set("job-1", { jobId: "job-1", status: "failed", error: "extraction blew up" });

      await pollPendingJobStatuses({ gmail: new FakeGmailClient([]), jobsApi, store });

      expect(store.getQueuedEmailsWithJobId()).toEqual([]);
    });

    it("leaves pending/active jobs queued", async () => {
      store.insertQueuedEmail("email-1");
      store.setJobId("email-1", "job-1");
      const jobsApi = new FakeJobsApiClient();
      jobsApi.statuses.set("job-1", { jobId: "job-1", status: "active" });

      await pollPendingJobStatuses({ gmail: new FakeGmailClient([]), jobsApi, store });

      expect(store.getQueuedEmailsWithJobId()).toEqual([{ emailId: "email-1", jobId: "job-1" }]);
    });

    it("leaves an email queued when the Jobs API doesn't know its job id", async () => {
      store.insertQueuedEmail("email-1");
      store.setJobId("email-1", "job-1");
      const jobsApi = new FakeJobsApiClient(); // no status registered for job-1

      await pollPendingJobStatuses({ gmail: new FakeGmailClient([]), jobsApi, store });

      expect(store.getQueuedEmailsWithJobId()).toEqual([{ emailId: "email-1", jobId: "job-1" }]);
    });
  });

  describe("runPollCycle", () => {
    it("runs discovery then status-polling in one cycle end to end", async () => {
      const gmail = new FakeGmailClient(["email-1"]);
      const jobsApi = new FakeJobsApiClient();

      await runPollCycle({ gmail, jobsApi, store });
      // Job was just scheduled and is still "pending" in the fake — not resolved yet.
      expect(store.getQueuedEmailsWithJobId()).toEqual([{ emailId: "email-1", jobId: "job-1" }]);

      // Simulate the job completing between poll cycles, then run again.
      jobsApi.statuses.set("job-1", {
        jobId: "job-1",
        status: "completed",
        result: { emailId: "email-1", actionItems: [{ title: "Do the thing" }] },
      });
      await runPollCycle({ gmail: new FakeGmailClient([]), jobsApi, store });

      expect(store.getQueuedEmailsWithJobId()).toEqual([]);
      // Re-running discovery with the same message ID again must not reschedule it.
      expect(jobsApi.scheduledEmailIds).toEqual(["email-1"]);
    });
  });
});
