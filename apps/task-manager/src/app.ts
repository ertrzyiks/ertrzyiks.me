import Fastify, { type FastifyInstance } from "fastify";
import { isValidBearerToken } from "./auth.js";
import type { GoogleTaskJobPayload } from "./queues/sync-google-tasks/googleTask.js";
import {
  GOOGLE_TASKS_QUEUE_NAME,
  type GoogleTasksJobsQueue,
} from "./queues/sync-google-tasks/queue.js";
import { QUEUE_NAME, type JobsQueue } from "./queues/extract-action-items/queue.js";
import { toSimplifiedStatus, type SimplifiedStatus } from "./jobStatus.js";
import { Sentry } from "./sentry.js";

interface JobStatusResponse {
  jobId: string;
  status: SimplifiedStatus;
  result?: unknown;
  error?: string;
}

// Minimal shape both JobsQueue and GoogleTasksJobsQueue's `getJob` satisfy — lets the two queues
// share this lookup instead of duplicating it per queue (their JobLike/GoogleTaskJobLike types
// differ only in an unused `id` field).
interface JobLookupQueue {
  getJob(jobId: string): Promise<
    { getState(): Promise<string>; returnvalue: unknown; failedReason?: string } | undefined
  >;
}

async function buildJobStatusResponse(
  queue: JobLookupQueue,
  jobId: string,
): Promise<JobStatusResponse | null> {
  const job = await queue.getJob(jobId);
  if (!job) return null;

  const status = toSimplifiedStatus(await job.getState());
  const response: JobStatusResponse = { jobId, status };

  if (status === "completed") response.result = job.returnvalue;
  if (status === "failed") response.error = job.failedReason;

  return response;
}

export function createApp(
  queue: JobsQueue,
  googleTasksQueue: GoogleTasksJobsQueue,
  bearerToken: string,
): FastifyInstance {
  // Fastify's logger defaults to disabled (a silent no-op `app.log`), which
  // made server startup/errors invisible — enable it outside tests, where
  // vitest sets NODE_ENV=test and per-request logs would just be noise.
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  // Reports any route handler exception that reaches Fastify's own error handling to Sentry
  // (`initSentry`/env docs live in sentry.ts) before Fastify serializes its usual 500 response —
  // doesn't change that response, just adds reporting. Every route below already returns its own
  // 400/401/404 explicitly rather than throwing, so this only ever fires on a genuine bug. Safe
  // to register unconditionally, including in tests: with no DSN configured (initSentry never
  // called), Sentry's own client is a no-op, so this hook is inert.
  Sentry.setupFastifyErrorHandler(app);

  // The bearer-auth hook is scoped to this encapsulated plugin rather than
  // added on `app` directly, so it only covers the routes below. Fastify
  // hooks cascade to nested `register()` contexts but not to siblings — this
  // matters because server.ts mounts Bull Board as a sibling on the same
  // `app` instance, guarded by its own separate Basic Auth hook (#296/#311),
  // and that UI needs to be reachable from a plain browser tab, which can't
  // attach an Authorization: Bearer header the way an API client can.
  app.register(async (api) => {
    api.addHook("onRequest", async (request, reply) => {
      if (!isValidBearerToken(request.headers.authorization, bearerToken)) {
        await reply.code(401).send({ error: "Unauthorized" });
      }
    });

    api.post<{ Body: { emailId?: string } }>("/jobs", async (request, reply) => {
      const emailId = request.body?.emailId;
      if (typeof emailId !== "string" || emailId.length === 0) {
        return reply.code(400).send({ error: "emailId is required" });
      }

      const job = await queue.add(QUEUE_NAME, { emailId });
      return reply.code(201).send({ jobId: job.id });
    });

    api.get<{ Params: { jobId: string } }>("/jobs/:jobId", async (request, reply) => {
      const response = await buildJobStatusResponse(queue, request.params.jobId);
      if (!response) return reply.code(404).send();
      return reply.send(response);
    });

    api.post<{ Body: { jobIds?: string[] } }>("/jobs/status", async (request, reply) => {
      const jobIds = request.body?.jobIds;
      if (!Array.isArray(jobIds) || jobIds.some((id) => typeof id !== "string")) {
        return reply.code(400).send({ error: "jobIds must be an array of strings" });
      }

      // Missing jobs are silently omitted — the batch endpoint has no defined
      // per-item error shape in the #241 spec.
      const results = (
        await Promise.all(jobIds.map((jobId) => buildJobStatusResponse(queue, jobId)))
      ).filter((result): result is JobStatusResponse => result !== null);

      return reply.send({ results });
    });

    api.post<{ Body: Partial<GoogleTaskJobPayload> }>("/google-tasks-jobs", async (request, reply) => {
      const { actionItemId, title, description, dueDate } = request.body ?? {};
      if (typeof actionItemId !== "number" || typeof title !== "string" || title.length === 0) {
        return reply.code(400).send({ error: "actionItemId and title are required" });
      }

      const job = await googleTasksQueue.add(GOOGLE_TASKS_QUEUE_NAME, {
        actionItemId,
        title,
        description,
        dueDate,
      });
      return reply.code(201).send({ jobId: job.id });
    });

    api.get<{ Params: { jobId: string } }>("/google-tasks-jobs/:jobId", async (request, reply) => {
      const response = await buildJobStatusResponse(googleTasksQueue, request.params.jobId);
      if (!response) return reply.code(404).send();
      return reply.send(response);
    });

    api.post<{ Body: { jobIds?: string[] } }>("/google-tasks-jobs/status", async (request, reply) => {
      const jobIds = request.body?.jobIds;
      if (!Array.isArray(jobIds) || jobIds.some((id) => typeof id !== "string")) {
        return reply.code(400).send({ error: "jobIds must be an array of strings" });
      }

      const results = (
        await Promise.all(jobIds.map((jobId) => buildJobStatusResponse(googleTasksQueue, jobId)))
      ).filter((result): result is JobStatusResponse => result !== null);

      return reply.send({ results });
    });
  });

  return app;
}
