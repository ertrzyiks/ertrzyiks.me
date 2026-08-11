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
import { createAxiomEventEmitter, noopEventEmitter, type EventEmitter } from "./axiomEvents.js";
import { BULL_BOARD_BASE_PATH, registerBullBoard } from "./bullBoard.js";
import { createGoogleCalendarClient } from "./googleCalendar.js";
import type { GoogleTaskJobPayload, GoogleTaskJobResult } from "./googleTask.js";
import { createGoogleTasksClient } from "./googleTasksClient.js";
import { processGoogleTaskJob } from "./googleTasksJobProcessor.js";
import { GOOGLE_TASKS_QUEUE_NAME } from "./googleTasksQueue.js";
import { createLibraryClient } from "./library.js";
import { loadLibraryWorkerConfig } from "./libraryConfig.js";
import { refreshLibraryLoans } from "./libraryRefresh.js";
import {
  createLibraryRefreshQueue,
  createLibrarySyncQueue,
  createLoanSyncQueueAdapter,
  LIBRARY_REFRESH_QUEUE_NAME,
  LIBRARY_SYNC_QUEUE_NAME,
  type LoanSyncJobPayload,
} from "./librarySyncQueue.js";
import { syncLoanCalendarEvent } from "./loanCalendarSync.js";
import { createStore } from "./loansStore.js";
import { createQueue, QUEUE_NAME } from "./queue.js";
import { initSentry, Sentry } from "./sentry.js";

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
const wbpgUsername = process.env.WBPG_USERNAME;
const wbpgPassword = process.env.WBPG_PASSWORD;
const googleCalendarClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const googleCalendarClientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const googleCalendarRefreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
const axiomToken = process.env.AXIOM_TOKEN;
const axiomDataset = process.env.AXIOM_DATASET;
const sentryDsn = process.env.SENTRY_DSN;

// Initialized before the fail-fast checks below so a misconfigured deploy (missing
// REDIS_URL/JOBS_API_BEARER_TOKEN) also gets reported, not just a missing DSN silently no-op-ing
// (see sentry.ts). A no-op when unset, same as everywhere else this SDK is touched.
initSentry(sentryDsn);

if (!redisUrl) throw new Error("REDIS_URL is required");
if (!bearerToken) throw new Error("JOBS_API_BEARER_TOKEN is required");

// Trend-event emission (#315) — plain, optional env vars like the other credentials in this
// file; see axiomEvents.ts's header comment for why this one credential doesn't need Keychain
// treatment on the Mac worker side. Unset, sync-google-tasks jobs just don't emit events —
// everything else about the worker is unaffected (see jobProcessor.ts/googleTasksJobProcessor.ts).
const events: EventEmitter =
  axiomToken && axiomDataset
    ? createAxiomEventEmitter({ token: axiomToken, dataset: axiomDataset, service: "task-manager" })
    : noopEventEmitter;

const queue = createQueue(redisUrl, QUEUE_NAME);
const googleTasksQueue = createQueue(redisUrl, GOOGLE_TASKS_QUEUE_NAME);
const app = createApp(queue, googleTasksQueue, bearerToken);

// Registered here (rather than only inside the "library sync workers" block below) so Bull
// Board below always shows these two queues and — since Bull Board isn't read-only — offers an
// "Add Job" button to trigger an out-of-schedule refresh, even before/without the library sync
// env vars being set. Whichever Worker actually consumes them (see below) processes any job on
// the queue identically regardless of which job name/data added it, scheduled or manual.
const libraryRefreshQueue = createLibraryRefreshQueue(redisUrl);
const librarySyncQueue = createLibrarySyncQueue(redisUrl);

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

    await registerBullBoard(bullBoardApp, [queue, googleTasksQueue, libraryRefreshQueue, librarySyncQueue]);
  });
} else {
  await registerBullBoard(app, [queue, googleTasksQueue, libraryRefreshQueue, librarySyncQueue]);
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
    async (job) => processGoogleTaskJob(job.data, { googleTasksClient, events }),
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
    Sentry.captureException(error, { tags: { queue: GOOGLE_TASKS_QUEUE_NAME, jobId: job?.id } });
  });
} else {
  app.log.warn(
    "GOOGLE_TASKS_CLIENT_ID/GOOGLE_TASKS_CLIENT_SECRET/GOOGLE_TASKS_REFRESH_TOKEN not fully set — " +
      "sync-google-tasks worker not started, jobs will queue up unconsumed",
  );
}

// The library-loan -> Google Calendar sync workers run right here too, same reasoning as
// sync-google-tasks above: neither WBPG login nor Google Calendar needs anything Mac-local, so
// there's no reason to isolate them the way the Gmail-reading worker.ts has to be. (This used to
// be a separate Dokku process type, librarySyncWorker.ts, requiring a manual `dokku ps:scale`
// step that's easy to forget — folding it in here means it just comes up with "web", no scaling
// step needed, matching the one existing precedent instead of being the odd one out.)
//
// Optional at startup like Google Tasks above: the Jobs API and Bull Board still come up fine
// before these five vars are provisioned, the two queues just sit unconsumed until they are.
if (wbpgUsername && wbpgPassword && googleCalendarClientId && googleCalendarClientSecret && googleCalendarRefreshToken) {
  // Safe to call without an env override — all five vars this checks for were just confirmed
  // present above, so none of loadLibraryWorkerConfig's required(...) checks can throw here.
  const libraryConfig = loadLibraryWorkerConfig();

  const store = createStore(libraryConfig.databasePath);
  const libraryClient = createLibraryClient(libraryConfig.wbpg);
  const calendar = createGoogleCalendarClient(libraryConfig.googleCalendar);
  const librarySyncQueueAdapter = createLoanSyncQueueAdapter(librarySyncQueue);

  // Re-registering the same scheduler id on every startup updates its schedule in place rather
  // than piling up duplicates, so it's safe to call unconditionally on every boot.
  await libraryRefreshQueue.upsertJobScheduler(
    "refresh-library-loans-schedule",
    { pattern: libraryConfig.refreshCronPattern, tz: "Europe/Warsaw" },
    { name: "refresh" },
  );

  const libraryRefreshWorker = new Worker(
    LIBRARY_REFRESH_QUEUE_NAME,
    async () => {
      const result = await refreshLibraryLoans({
        libraryClient,
        store,
        syncQueue: librarySyncQueueAdapter,
        calendar,
      });
      app.log.info(
        `library refresh: ${result.loanCount} current loan(s), ` +
          `${result.removedCalendarEventGroups} stale calendar event group(s) removed`,
      );
    },
    { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) },
  );

  const librarySyncWorker = new Worker<LoanSyncJobPayload>(
    LIBRARY_SYNC_QUEUE_NAME,
    async (job) => {
      await syncLoanCalendarEvent(job.data.holdingId, { store, calendar });
    },
    { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) },
  );

  for (const worker of [libraryRefreshWorker, librarySyncWorker]) {
    worker.on("ready", () => app.log.info(`library sync worker ready, consuming "${worker.name}"`));
    worker.on("failed", (job, error) => {
      app.log.error(`Library sync job ${job?.id ?? "<unknown>"} on "${worker.name}" failed: ${error}`);
      Sentry.captureException(error, { tags: { queue: worker.name, jobId: job?.id } });
    });
  }
} else {
  app.log.warn(
    "WBPG_USERNAME/WBPG_PASSWORD/GOOGLE_CALENDAR_CLIENT_ID/GOOGLE_CALENDAR_CLIENT_SECRET/" +
      "GOOGLE_CALENDAR_REFRESH_TOKEN not fully set — library sync workers not started, jobs will queue up unconsumed",
  );
}

try {
  await app.listen({ port, host: "::" });
  app.log.info(`task-manager listening on port ${port}`);
  app.log.info(`Bull Board UI available at http://localhost:${port}${BULL_BOARD_BASE_PATH}`);
} catch (error) {
  app.log.error(error);
  Sentry.captureException(error);
  process.exit(1);
}
