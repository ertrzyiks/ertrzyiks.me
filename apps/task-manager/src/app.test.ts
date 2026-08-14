import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import type { GoogleTaskJobPayload } from "./modules/google-tasks/queues/sync-google-tasks/googleTask.js";
import type { GoogleTaskJobLike, GoogleTasksJobsQueue } from "./modules/google-tasks/queues/sync-google-tasks/queue.js";
import type { JobLike, JobsQueue } from "./modules/email-processing/queues/extract-action-items/queue.js";

const BEARER_TOKEN = "test-token";

class FakeJob implements JobLike {
  id: string;
  state: string;
  returnvalue: unknown;
  failedReason?: string;

  constructor(id: string, state = "waiting") {
    this.id = id;
    this.state = state;
  }

  async getState() {
    return this.state;
  }
}

class FakeQueue implements JobsQueue {
  jobs = new Map<string, FakeJob>();
  private nextId = 1;

  async add(_name: string, _data: { emailId: string }) {
    const job = new FakeJob(String(this.nextId++));
    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(jobId: string) {
    return this.jobs.get(jobId);
  }
}

// Same shape as FakeJob/FakeQueue above, kept separate rather than shared/generic to match this
// codebase's existing per-queue file convention (see googleTasksJobsQueue.ts).
class FakeGoogleTaskJob implements GoogleTaskJobLike {
  id: string;
  state: string;
  returnvalue: unknown;
  failedReason?: string;

  constructor(id: string, state = "waiting") {
    this.id = id;
    this.state = state;
  }

  async getState() {
    return this.state;
  }
}

class FakeGoogleTasksQueue implements GoogleTasksJobsQueue {
  jobs = new Map<string, FakeGoogleTaskJob>();
  private nextId = 1;

  async add(_name: string, _data: GoogleTaskJobPayload) {
    const job = new FakeGoogleTaskJob(String(this.nextId++));
    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(jobId: string) {
    return this.jobs.get(jobId);
  }
}

function authHeader() {
  return { authorization: `Bearer ${BEARER_TOKEN}` };
}

describe("task-manager app", () => {
  let queue: FakeQueue;
  let googleTasksQueue: FakeGoogleTasksQueue;
  let app: FastifyInstance;

  beforeEach(() => {
    queue = new FakeQueue();
    googleTasksQueue = new FakeGoogleTasksQueue();
    app = createApp(queue, googleTasksQueue, BEARER_TOKEN);
  });

  describe("auth", () => {
    it("rejects requests without a valid bearer token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/jobs",
        payload: { emailId: "abc" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("does not gate routes registered as siblings on the returned app instance", async () => {
      // server.ts mounts Bull Board this way (app.register(...) as a
      // sibling of createApp's internal jobs-routes plugin), specifically so
      // it's reachable from a plain browser tab, which can't attach an
      // Authorization header. This pins that the auth hook stays scoped to
      // the /jobs routes and doesn't leak back out to `app` itself.
      app.get("/sibling-route", async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({ method: "GET", url: "/sibling-route" });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("error handling", () => {
    it("still returns a 500 (instead of crashing) when a route handler throws unexpectedly", async () => {
      // Regression check for Sentry's setupFastifyErrorHandler hook (app.ts) — pins that it
      // only *reports* an unhandled route exception, without changing Fastify's own error
      // response. No DSN is configured in this test, so nothing is actually sent anywhere.
      queue.add = async () => {
        throw new Error("unexpected queue failure");
      };

      const response = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: authHeader(),
        payload: { emailId: "email-1" },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe("POST /jobs", () => {
    it("schedules a job and returns its id", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: authHeader(),
        payload: { emailId: "email-1" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ jobId: "1" });
    });

    it("rejects a missing emailId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/jobs",
        headers: authHeader(),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /jobs/:jobId", () => {
    it("returns 404 for an unknown job", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/jobs/missing",
        headers: authHeader(),
      });

      expect(response.statusCode).toBe(404);
    });

    it("reports pending for a waiting job", async () => {
      queue.jobs.set("1", new FakeJob("1", "waiting"));

      const response = await app.inject({
        method: "GET",
        url: "/jobs/1",
        headers: authHeader(),
      });

      expect(response.json()).toEqual({ jobId: "1", status: "pending" });
    });

    it("includes the result for a completed job", async () => {
      const job = new FakeJob("1", "completed");
      job.returnvalue = { emailId: "email-1", actionItems: [] };
      queue.jobs.set("1", job);

      const response = await app.inject({
        method: "GET",
        url: "/jobs/1",
        headers: authHeader(),
      });

      expect(response.json()).toEqual({
        jobId: "1",
        status: "completed",
        result: { emailId: "email-1", actionItems: [] },
      });
    });

    it("includes the error for a failed job", async () => {
      const job = new FakeJob("1", "failed");
      job.failedReason = "boom";
      queue.jobs.set("1", job);

      const response = await app.inject({
        method: "GET",
        url: "/jobs/1",
        headers: authHeader(),
      });

      expect(response.json()).toEqual({ jobId: "1", status: "failed", error: "boom" });
    });
  });

  describe("POST /jobs/status", () => {
    it("returns results for known jobs and omits unknown ones", async () => {
      const job = new FakeJob("1", "completed");
      job.returnvalue = { emailId: "email-1", actionItems: [] };
      queue.jobs.set("1", job);

      const response = await app.inject({
        method: "POST",
        url: "/jobs/status",
        headers: authHeader(),
        payload: { jobIds: ["1", "missing"] },
      });

      expect(response.json()).toEqual({
        results: [
          { jobId: "1", status: "completed", result: { emailId: "email-1", actionItems: [] } },
        ],
      });
    });

    it("rejects a non-array jobIds", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/jobs/status",
        headers: authHeader(),
        payload: { jobIds: "not-an-array" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /google-tasks-jobs", () => {
    it("schedules a job and returns its id", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/google-tasks-jobs",
        headers: authHeader(),
        payload: { actionItemId: 1, title: "Send the report" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ jobId: "1" });
    });

    it("rejects a missing title", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/google-tasks-jobs",
        headers: authHeader(),
        payload: { actionItemId: 1 },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects a missing actionItemId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/google-tasks-jobs",
        headers: authHeader(),
        payload: { title: "Send the report" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /google-tasks-jobs/:jobId", () => {
    it("returns 404 for an unknown job", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/google-tasks-jobs/missing",
        headers: authHeader(),
      });

      expect(response.statusCode).toBe(404);
    });

    it("includes the result for a completed job", async () => {
      const job = new FakeGoogleTaskJob("1", "completed");
      job.returnvalue = { actionItemId: 1, googleTaskId: "gtask-1" };
      googleTasksQueue.jobs.set("1", job);

      const response = await app.inject({
        method: "GET",
        url: "/google-tasks-jobs/1",
        headers: authHeader(),
      });

      expect(response.json()).toEqual({
        jobId: "1",
        status: "completed",
        result: { actionItemId: 1, googleTaskId: "gtask-1" },
      });
    });
  });

  describe("POST /google-tasks-jobs/status", () => {
    it("returns results for known jobs and omits unknown ones", async () => {
      const job = new FakeGoogleTaskJob("1", "completed");
      job.returnvalue = { actionItemId: 1, googleTaskId: "gtask-1" };
      googleTasksQueue.jobs.set("1", job);

      const response = await app.inject({
        method: "POST",
        url: "/google-tasks-jobs/status",
        headers: authHeader(),
        payload: { jobIds: ["1", "missing"] },
      });

      expect(response.json()).toEqual({
        results: [
          { jobId: "1", status: "completed", result: { actionItemId: 1, googleTaskId: "gtask-1" } },
        ],
      });
    });

    it("rejects a non-array jobIds", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/google-tasks-jobs/status",
        headers: authHeader(),
        payload: { jobIds: "not-an-array" },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
