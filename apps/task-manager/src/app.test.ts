import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import type { CalendarEventJobPayload } from "./modules/google-calendar/queues/sync-calendar-events/calendarEvent.js";
import type {
  CalendarEventJobLike,
  CalendarEventJobsQueue,
} from "./modules/google-calendar/queues/sync-calendar-events/queue.js";
import type { TodoistJobPayload } from "./modules/todoist/queues/sync-todoist/todoistTask.js";
import type { TodoistJobLike, TodoistJobsQueue } from "./modules/todoist/queues/sync-todoist/queue.js";
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
// codebase's existing per-queue file convention (see todoistQueue.ts).
class FakeTodoistJob implements TodoistJobLike {
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

class FakeTodoistQueue implements TodoistJobsQueue {
  jobs = new Map<string, FakeTodoistJob>();
  private nextId = 1;

  async add(_name: string, _data: TodoistJobPayload) {
    const job = new FakeTodoistJob(String(this.nextId++));
    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(jobId: string) {
    return this.jobs.get(jobId);
  }
}

// Same shape as FakeJob/FakeQueue above, kept separate rather than shared/generic to match this
// codebase's existing per-queue file convention (see calendarEventsQueue.ts).
class FakeCalendarEventJob implements CalendarEventJobLike {
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

class FakeCalendarEventsQueue implements CalendarEventJobsQueue {
  jobs = new Map<string, FakeCalendarEventJob>();
  private nextId = 1;

  async add(_name: string, _data: CalendarEventJobPayload) {
    const job = new FakeCalendarEventJob(String(this.nextId++));
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
  let todoistQueue: FakeTodoistQueue;
  let calendarEventsQueue: FakeCalendarEventsQueue;
  let app: FastifyInstance;

  beforeEach(() => {
    queue = new FakeQueue();
    todoistQueue = new FakeTodoistQueue();
    calendarEventsQueue = new FakeCalendarEventsQueue();
    app = createApp(queue, todoistQueue, calendarEventsQueue, BEARER_TOKEN);
  });

  describe("GET /health", () => {
    it("returns 200 without requiring a bearer token", async () => {
      const response = await app.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
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

  describe("POST /todoist-jobs", () => {
    it("schedules a job and returns its id", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/todoist-jobs",
        headers: authHeader(),
        payload: { actionItemId: 1, title: "Send the report" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ jobId: "1" });
    });

    it("rejects a missing title", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/todoist-jobs",
        headers: authHeader(),
        payload: { actionItemId: 1 },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects a missing actionItemId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/todoist-jobs",
        headers: authHeader(),
        payload: { title: "Send the report" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /todoist-jobs/:jobId", () => {
    it("returns 404 for an unknown job", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/todoist-jobs/missing",
        headers: authHeader(),
      });

      expect(response.statusCode).toBe(404);
    });

    it("includes the result for a completed job", async () => {
      const job = new FakeTodoistJob("1", "completed");
      job.returnvalue = { actionItemId: 1, todoistTaskId: "todoist-1" };
      todoistQueue.jobs.set("1", job);

      const response = await app.inject({
        method: "GET",
        url: "/todoist-jobs/1",
        headers: authHeader(),
      });

      expect(response.json()).toEqual({
        jobId: "1",
        status: "completed",
        result: { actionItemId: 1, todoistTaskId: "todoist-1" },
      });
    });
  });

  describe("POST /todoist-jobs/status", () => {
    it("returns results for known jobs and omits unknown ones", async () => {
      const job = new FakeTodoistJob("1", "completed");
      job.returnvalue = { actionItemId: 1, todoistTaskId: "todoist-1" };
      todoistQueue.jobs.set("1", job);

      const response = await app.inject({
        method: "POST",
        url: "/todoist-jobs/status",
        headers: authHeader(),
        payload: { jobIds: ["1", "missing"] },
      });

      expect(response.json()).toEqual({
        results: [
          { jobId: "1", status: "completed", result: { actionItemId: 1, todoistTaskId: "todoist-1" } },
        ],
      });
    });

    it("rejects a non-array jobIds", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/todoist-jobs/status",
        headers: authHeader(),
        payload: { jobIds: "not-an-array" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /calendar-event-jobs", () => {
    it("schedules a job and returns its id", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/calendar-event-jobs",
        headers: authHeader(),
        payload: {
          calendarEventId: 1,
          title: "Team offsite",
          date: "2026-09-10",
          startTime: "09:00",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ jobId: "1" });
    });

    it("rejects a missing title", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/calendar-event-jobs",
        headers: authHeader(),
        payload: { calendarEventId: 1, date: "2026-09-10", startTime: "09:00" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects a missing calendarEventId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/calendar-event-jobs",
        headers: authHeader(),
        payload: { title: "Team offsite", date: "2026-09-10", startTime: "09:00" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects a missing date", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/calendar-event-jobs",
        headers: authHeader(),
        payload: { calendarEventId: 1, title: "Team offsite", startTime: "09:00" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects a missing startTime", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/calendar-event-jobs",
        headers: authHeader(),
        payload: { calendarEventId: 1, title: "Team offsite", date: "2026-09-10" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /calendar-event-jobs/:jobId", () => {
    it("returns 404 for an unknown job", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/calendar-event-jobs/missing",
        headers: authHeader(),
      });

      expect(response.statusCode).toBe(404);
    });

    it("includes the result for a completed job", async () => {
      const job = new FakeCalendarEventJob("1", "completed");
      job.returnvalue = { calendarEventId: 1, googleEventId: "gcal-1" };
      calendarEventsQueue.jobs.set("1", job);

      const response = await app.inject({
        method: "GET",
        url: "/calendar-event-jobs/1",
        headers: authHeader(),
      });

      expect(response.json()).toEqual({
        jobId: "1",
        status: "completed",
        result: { calendarEventId: 1, googleEventId: "gcal-1" },
      });
    });
  });

  describe("POST /calendar-event-jobs/status", () => {
    it("returns results for known jobs and omits unknown ones", async () => {
      const job = new FakeCalendarEventJob("1", "completed");
      job.returnvalue = { calendarEventId: 1, googleEventId: "gcal-1" };
      calendarEventsQueue.jobs.set("1", job);

      const response = await app.inject({
        method: "POST",
        url: "/calendar-event-jobs/status",
        headers: authHeader(),
        payload: { jobIds: ["1", "missing"] },
      });

      expect(response.json()).toEqual({
        results: [
          { jobId: "1", status: "completed", result: { calendarEventId: 1, googleEventId: "gcal-1" } },
        ],
      });
    });

    it("rejects a non-array jobIds", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/calendar-event-jobs/status",
        headers: authHeader(),
        payload: { jobIds: "not-an-array" },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
