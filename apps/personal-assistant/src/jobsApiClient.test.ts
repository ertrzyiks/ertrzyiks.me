import { describe, expect, it, vi } from "vitest";
import { createJobsApiClient } from "./jobsApiClient.js";

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn(async (url: string | URL, init: RequestInit = {}) => handler(String(url), init));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CONFIG = { baseUrl: "http://localhost:3000", bearerToken: "test-token" };

describe("createJobsApiClient", () => {
  describe("scheduleJob", () => {
    it("POSTs to /jobs with the emailId and bearer token, returning the jobId", async () => {
      const fetchFn = fakeFetch((url) => {
        expect(url).toBe("http://localhost:3000/jobs");
        return jsonResponse({ jobId: "job-1" }, 201);
      });
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(client.scheduleJob("email-1")).resolves.toEqual({ jobId: "job-1" });

      const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ emailId: "email-1" });
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    });

    it("throws when the response is not ok", async () => {
      const fetchFn = fakeFetch(() => jsonResponse({ error: "Unauthorized" }, 401));
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(client.scheduleJob("email-1")).rejects.toThrow(/status 401/);
    });

    it("strips a trailing slash from the base URL", async () => {
      const fetchFn = fakeFetch((url) => {
        expect(url).toBe("http://localhost:3000/jobs");
        return jsonResponse({ jobId: "job-1" }, 201);
      });
      const client = createJobsApiClient({
        baseUrl: "http://localhost:3000/",
        bearerToken: "test-token",
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      await client.scheduleJob("email-1");

      expect(fetchFn).toHaveBeenCalled();
    });
  });

  describe("getJobStatuses", () => {
    it("POSTs to /jobs/status with the jobIds and returns results", async () => {
      const fetchFn = fakeFetch((url) => {
        expect(url).toBe("http://localhost:3000/jobs/status");
        return jsonResponse({
          results: [
            {
              jobId: "job-1",
              status: "completed",
              result: { emailId: "email-1", actionItems: [{ title: "Do the thing" }] },
            },
          ],
        });
      });
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(client.getJobStatuses(["job-1", "job-2"])).resolves.toEqual([
        {
          jobId: "job-1",
          status: "completed",
          result: { emailId: "email-1", actionItems: [{ title: "Do the thing" }] },
        },
      ]);
    });

    it("returns an empty array without making a request when jobIds is empty", async () => {
      const fetchFn = fakeFetch(() => jsonResponse({ results: [] }));
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(client.getJobStatuses([])).resolves.toEqual([]);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe("scheduleGoogleTaskJob", () => {
    it("POSTs to /google-tasks-jobs with the item and bearer token, returning the jobId", async () => {
      const fetchFn = fakeFetch((url) => {
        expect(url).toBe("http://localhost:3000/google-tasks-jobs");
        return jsonResponse({ jobId: "gtask-job-1" }, 201);
      });
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(
        client.scheduleGoogleTaskJob({ actionItemId: 1, title: "Send the report" }),
      ).resolves.toEqual({ jobId: "gtask-job-1" });

      const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ actionItemId: 1, title: "Send the report" });
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    });

    it("throws when the response is not ok", async () => {
      const fetchFn = fakeFetch(() => jsonResponse({ error: "Unauthorized" }, 401));
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(
        client.scheduleGoogleTaskJob({ actionItemId: 1, title: "Send the report" }),
      ).rejects.toThrow(/status 401/);
    });
  });

  describe("getGoogleTaskJobStatuses", () => {
    it("POSTs to /google-tasks-jobs/status with the jobIds and returns results", async () => {
      const fetchFn = fakeFetch((url) => {
        expect(url).toBe("http://localhost:3000/google-tasks-jobs/status");
        return jsonResponse({
          results: [
            { jobId: "gtask-job-1", status: "completed", result: { actionItemId: 1, googleTaskId: "gtask-1" } },
          ],
        });
      });
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(client.getGoogleTaskJobStatuses(["gtask-job-1", "gtask-job-2"])).resolves.toEqual([
        { jobId: "gtask-job-1", status: "completed", result: { actionItemId: 1, googleTaskId: "gtask-1" } },
      ]);
    });

    it("returns an empty array without making a request when jobIds is empty", async () => {
      const fetchFn = fakeFetch(() => jsonResponse({ results: [] }));
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(client.getGoogleTaskJobStatuses([])).resolves.toEqual([]);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe("scheduleCalendarEventJob", () => {
    it("POSTs to /calendar-event-jobs with the item and bearer token, returning the jobId", async () => {
      const fetchFn = fakeFetch((url) => {
        expect(url).toBe("http://localhost:3000/calendar-event-jobs");
        return jsonResponse({ jobId: "gcal-job-1" }, 201);
      });
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(
        client.scheduleCalendarEventJob({
          calendarEventId: 1,
          title: "Team offsite",
          date: "2026-09-10",
          startTime: "09:00",
        }),
      ).resolves.toEqual({ jobId: "gcal-job-1" });

      const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        calendarEventId: 1,
        title: "Team offsite",
        date: "2026-09-10",
        startTime: "09:00",
      });
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    });

    it("throws when the response is not ok", async () => {
      const fetchFn = fakeFetch(() => jsonResponse({ error: "Unauthorized" }, 401));
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(
        client.scheduleCalendarEventJob({
          calendarEventId: 1,
          title: "Team offsite",
          date: "2026-09-10",
          startTime: "09:00",
        }),
      ).rejects.toThrow(/status 401/);
    });
  });

  describe("getCalendarEventJobStatuses", () => {
    it("POSTs to /calendar-event-jobs/status with the jobIds and returns results", async () => {
      const fetchFn = fakeFetch((url) => {
        expect(url).toBe("http://localhost:3000/calendar-event-jobs/status");
        return jsonResponse({
          results: [
            {
              jobId: "gcal-job-1",
              status: "completed",
              result: { calendarEventId: 1, googleEventId: "gcal-1" },
            },
          ],
        });
      });
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(client.getCalendarEventJobStatuses(["gcal-job-1", "gcal-job-2"])).resolves.toEqual([
        { jobId: "gcal-job-1", status: "completed", result: { calendarEventId: 1, googleEventId: "gcal-1" } },
      ]);
    });

    it("returns an empty array without making a request when jobIds is empty", async () => {
      const fetchFn = fakeFetch(() => jsonResponse({ results: [] }));
      const client = createJobsApiClient({ ...CONFIG, fetchFn: fetchFn as unknown as typeof fetch });

      await expect(client.getCalendarEventJobStatuses([])).resolves.toEqual([]);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});
