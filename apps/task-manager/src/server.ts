// Single entrypoint for both local dev and production (Dokku runs this via `pnpm start` →
// `node dist/server.js`) — previously split into this file (prod-only) and devServer.ts
// (dev-only, so Bull Board and its `dotenv`/`@bull-board/*` dependencies stayed out of
// production). That split stopped paying for itself once Bull Board needed to be always-on in
// production too (#296/#311): `dotenv/config` is a no-op when no `.env` file exists, which is the
// case in production, so loading it unconditionally is safe.
import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { createApp } from "./app.js";
import { isValidBasicAuth } from "./auth.js";
import { BULL_BOARD_BASE_PATH, registerBullBoard } from "./bullBoard.js";
import type { GoogleTaskJobPayload, GoogleTaskJobResult } from "./googleTask.js";
import { createGoogleTasksClient } from "./googleTasksClient.js";
import { processGoogleTaskJob } from "./googleTasksJobProcessor.js";
import { GOOGLE_TASKS_QUEUE_NAME } from "./googleTasksQueue.js";
import { createQueue, QUEUE_NAME } from "./queue.js";

const redisUrl = process.env.REDIS_URL;
const bearerToken = process.env.JOBS_API_BEARER_TOKEN;
const port = Number(process.env.PORT ?? 3000);
const bullBoardUsername = process.env.TASK_MANAGER_BULL_BOARD_BASIC_AUTH_USERNAME;
const bullBoardPassword = process.env.TASK_MANAGER_BULL_BOARD_BASIC_AUTH_PASSWORD;
const googleTasksClientId = process.env.GOOGLE_TASKS_CLIENT_ID;
const googleTasksClientSecret = process.env.GOOGLE_TASKS_CLIENT_SECRET;
const googleTasksRefreshToken = process.env.GOOGLE_TASKS_REFRESH_TOKEN;
const googleTasksListId = process.env.GOOGLE_TASKS_LIST_ID;
const googleTasksRateLimitMax = Number(process.env.GOOGLE_TASKS_RATE_LIMIT_MAX ?? 5);
const googleTasksRateLimitDurationMs = Number(process.env.GOOGLE_TASKS_RATE_LIMIT_DURATION_MS ?? 1000);

if (!redisUrl) throw new Error("REDIS_URL is required");
if (!bearerToken) throw new Error("JOBS_API_BEARER_TOKEN is required");

const queue = createQueue(redisUrl, QUEUE_NAME);
const googleTasksQueue = createQueue(redisUrl, GOOGLE_TASKS_QUEUE_NAME);
const app = createApp(queue, googleTasksQueue, bearerToken);

// Bull Board is always mounted. Basic Auth guards it only when both credentials are configured:
// unset — the normal local dev state, nothing in .env by default — leaves it open, matching the
// low-friction workflow this had before merging out of devServer.ts. Production always sets both
// via Terraform (#313), so the guard is always active there. This scheme is intentionally
// separate from the /jobs API's Bearer auth in app.ts — Bull Board needs to be reachable from a
// plain browser tab, which can't attach an Authorization: Bearer header the way an API client can.
if (bullBoardUsername && bullBoardPassword) {
  await app.register(async (bullBoardApp) => {
    bullBoardApp.addHook("onRequest", async (request, reply) => {
      if (!isValidBasicAuth(request.headers.authorization, bullBoardUsername, bullBoardPassword)) {
        await reply.code(401).header("WWW-Authenticate", 'Basic realm="task-manager"').send();
      }
    });

    await registerBullBoard(bullBoardApp, [queue, googleTasksQueue]);
  });
} else {
  await registerBullBoard(app, [queue, googleTasksQueue]);
}

// The `sync-google-tasks` worker runs right here, in the same cloud process as the Jobs API —
// unlike the `extract-action-items` worker (worker.ts), which is Mac-only because it's the only
// thing allowed to read raw email content. Pushing an already-extracted action item to Google
// Tasks has no such constraint, so it doesn't need to wait for the Mac to be online.
//
// The three credentials are optional at startup (not `required(...)`-style fail-fast like
// REDIS_URL/JOBS_API_BEARER_TOKEN above) so this deploys cleanly before the Google Tasks OAuth
// credential has been provisioned (see scripts/google-tasks-oauth) — the Jobs API still accepts
// `/google-tasks-jobs` either way, jobs just queue up unconsumed until the worker starts.
if (googleTasksClientId && googleTasksClientSecret && googleTasksRefreshToken) {
  const googleTasksClient = createGoogleTasksClient({
    clientId: googleTasksClientId,
    clientSecret: googleTasksClientSecret,
    refreshToken: googleTasksRefreshToken,
    taskListId: googleTasksListId,
  });

  // `limiter` throttles how fast this worker drains the queue — BullMQ just holds jobs back
  // rather than dropping/retrying them, so a burst of scheduled jobs (e.g. many action items
  // completing in one personal-assistant poll cycle) gets smoothed out over time instead of
  // firing at Google Tasks all at once. Added after a real "quota exceeded" error from the Tasks
  // API; 5/sec is a conservative starting point, not a measured ceiling — tune via the env vars
  // if it turns out to be too slow (a deep backlog) or still too fast (still hitting quota).
  const googleTasksConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const googleTasksWorker = new Worker<GoogleTaskJobPayload, GoogleTaskJobResult>(
    GOOGLE_TASKS_QUEUE_NAME,
    async (job) => processGoogleTaskJob(job.data, { googleTasksClient }),
    {
      connection: googleTasksConnection,
      limiter: { max: googleTasksRateLimitMax, duration: googleTasksRateLimitDurationMs },
    },
  );

  googleTasksWorker.on("ready", () => {
    app.log.info(`sync-google-tasks worker ready, consuming queue "${GOOGLE_TASKS_QUEUE_NAME}"`);
  });

  googleTasksWorker.on("failed", (job, error) => {
    app.log.error(`Google Tasks sync job ${job?.id ?? "<unknown>"} failed: ${error}`);
  });
} else {
  app.log.warn(
    "GOOGLE_TASKS_CLIENT_ID/GOOGLE_TASKS_CLIENT_SECRET/GOOGLE_TASKS_REFRESH_TOKEN not fully set — " +
      "sync-google-tasks worker not started, jobs will queue up unconsumed",
  );
}

try {
  await app.listen({ port, host: "::" });
  app.log.info(`task-manager listening on port ${port}`);
  app.log.info(`Bull Board UI available at http://localhost:${port}${BULL_BOARD_BASE_PATH}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
