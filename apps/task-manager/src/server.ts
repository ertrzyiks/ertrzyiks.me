// Single entrypoint for both local dev and production (Dokku runs this via `pnpm start` →
// `node dist/server.js`) — previously split into this file (prod-only) and devServer.ts
// (dev-only, so Bull Board and its `dotenv`/`@bull-board/*` dependencies stayed out of
// production). That split stopped paying for itself once Bull Board needed to be always-on in
// production too (#296/#311): `dotenv/config` is a no-op when no `.env` file exists, which is the
// case in production, so loading it unconditionally is safe.
import "dotenv/config";
import { Redis } from "ioredis";
import { createApp } from "./app.js";
import { isValidBasicAuth } from "./auth.js";
import { createAxiomEventEmitter, noopEventEmitter, type EventEmitter } from "./axiomEvents.js";
import { BULL_BOARD_BASE_PATH, registerBullBoard } from "./bullBoard.js";
import { createGoogleCalendarClient } from "./googleCalendarClient.js";
import { createQueue as createCalendarEventsQueue } from "./modules/google-calendar/queues/sync-calendar-events/queue.js";
import { createWorker as createCalendarEventsWorker } from "./modules/google-calendar/queues/sync-calendar-events/worker.js";
import { createTodoistClient } from "./modules/todoist/queues/sync-todoist/todoistClient.js";
import { createLibraryClient } from "./modules/loans/queues/refresh-library-loans/library.js";
import { loadLibraryWorkerConfig } from "./modules/loans/libraryConfig.js";
import { createGmailFetcher } from "./modules/email-processing/queues/extract-action-items/gmail.js";
import {
  createFileInspectionLogger,
  noopInspectionLogger,
  type InspectionLogger,
} from "./modules/email-processing/queues/extract-action-items/inspectionLog.js";
import { createOpenRouterExtractor } from "./modules/email-processing/queues/extract-action-items/openRouter.js";
import { createQueue as createExtractActionItemsQueue } from "./modules/email-processing/queues/extract-action-items/queue.js";
import { createWorker as createExtractActionItemsWorker } from "./modules/email-processing/queues/extract-action-items/worker.js";
import { createQueue as createTodoistQueue } from "./modules/todoist/queues/sync-todoist/queue.js";
import { createWorker as createTodoistWorker } from "./modules/todoist/queues/sync-todoist/worker.js";
import { createQueue as createLibraryRefreshQueue } from "./modules/loans/queues/refresh-library-loans/queue.js";
import { createWorker as createLibraryRefreshWorker } from "./modules/loans/queues/refresh-library-loans/worker.js";
import {
  createQueue as createLibrarySyncQueue,
  createLoanSyncQueueAdapter,
} from "./modules/loans/queues/sync-loan-calendar/queue.js";
import { createWorker as createLibrarySyncWorker } from "./modules/loans/queues/sync-loan-calendar/worker.js";
import { createStore } from "./modules/loans/loansStore.js";
import { initSentry, Sentry } from "./sentry.js";

const redisUrl = process.env.REDIS_URL;
const bearerToken = process.env.JOBS_API_BEARER_TOKEN;
const port = Number(process.env.PORT ?? 3000);
const bullBoardUsername = process.env.TASK_MANAGER_BULL_BOARD_BASIC_AUTH_USERNAME;
const bullBoardPassword = process.env.TASK_MANAGER_BULL_BOARD_BASIC_AUTH_PASSWORD;
const todoistApiToken = process.env.TODOIST_API_TOKEN;
const todoistProjectId = process.env.TODOIST_PROJECT_ID;
const todoistRateLimitMax = Number(process.env.TODOIST_RATE_LIMIT_MAX ?? 5);
const todoistRateLimitDurationMs = Number(process.env.TODOIST_RATE_LIMIT_DURATION_MS ?? 1000);
const wbpgUsername = process.env.WBPG_USERNAME;
const wbpgPassword = process.env.WBPG_PASSWORD;
const googleCalendarClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const googleCalendarClientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const googleCalendarRefreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
const googleCalendarTimeZone = process.env.GOOGLE_CALENDAR_TIMEZONE;
const calendarEventsRateLimitMax = Number(process.env.CALENDAR_EVENTS_RATE_LIMIT_MAX ?? 5);
const calendarEventsRateLimitDurationMs = Number(
  process.env.CALENDAR_EVENTS_RATE_LIMIT_DURATION_MS ?? 1000,
);
const gmailClientId = process.env.GMAIL_CLIENT_ID;
const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = process.env.OPENROUTER_MODEL;
const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL;
const extractActionItemsRateLimitMax = Number(process.env.EXTRACT_ACTION_ITEMS_RATE_LIMIT_MAX ?? 5);
const extractActionItemsRateLimitDurationMs = Number(
  process.env.EXTRACT_ACTION_ITEMS_RATE_LIMIT_DURATION_MS ?? 60_000,
);
const inspectionDirEnv = process.env.WORKER_INSPECTION_DIR;
const inspectionDir = inspectionDirEnv === undefined ? "./audit" : inspectionDirEnv;
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
// treatment on the Mac worker side. Unset, sync-todoist jobs just don't emit events —
// everything else about the worker is unaffected (see jobProcessor.ts/todoistJobProcessor.ts).
const events: EventEmitter =
  axiomToken && axiomDataset
    ? createAxiomEventEmitter({ token: axiomToken, dataset: axiomDataset, service: "task-manager" })
    : noopEventEmitter;

const queue = createExtractActionItemsQueue(redisUrl);
const todoistQueue = createTodoistQueue(redisUrl);
const calendarEventsQueue = createCalendarEventsQueue(redisUrl);
const app = createApp(queue, todoistQueue, calendarEventsQueue, bearerToken);

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

    await registerBullBoard(bullBoardApp, [
      queue,
      todoistQueue,
      calendarEventsQueue,
      libraryRefreshQueue,
      librarySyncQueue,
    ]);
  });
} else {
  await registerBullBoard(app, [
    queue,
    todoistQueue,
    calendarEventsQueue,
    libraryRefreshQueue,
    librarySyncQueue,
  ]);
}

// The `sync-todoist` worker runs right here, in the same cloud process as the Jobs API — unlike
// the `extract-action-items` worker (worker.ts), which is Mac-only because it's the only thing
// allowed to read raw email content. Pushing an already-extracted action item to Todoist has no
// such constraint, so it doesn't need to wait for the Mac to be online.
//
// The credential is optional at startup (not `required(...)`-style fail-fast like
// REDIS_URL/JOBS_API_BEARER_TOKEN above) so this deploys cleanly before the Todoist API token has
// been provisioned — the Jobs API still accepts `/todoist-jobs` either way, jobs just queue up
// unconsumed until the worker starts.
if (todoistApiToken) {
  const todoistClient = createTodoistClient({
    apiToken: todoistApiToken,
    projectId: todoistProjectId,
  });

  // `limiter` throttles how fast this worker drains the queue — BullMQ just holds jobs back
  // rather than dropping/retrying them, so a burst of scheduled jobs (e.g. many action items
  // completing in one personal-assistant poll cycle) gets smoothed out over time instead of
  // firing at Todoist all at once. Kept as the same conservative default the old Google Tasks
  // worker used after hitting a real "quota exceeded" error there; 5/sec is a starting point, not
  // a measured ceiling for Todoist's own API — tune via the env vars if it turns out to be too
  // slow (a deep backlog) or still too fast (hitting Todoist's rate limit).
  const todoistConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  createTodoistWorker(
    todoistConnection,
    { todoistClient, events },
    {
      limiter: { max: todoistRateLimitMax, duration: todoistRateLimitDurationMs },
      logger: app.log,
    },
  );
} else {
  app.log.warn("TODOIST_API_TOKEN not set — sync-todoist worker not started, jobs will queue up unconsumed");
}

// The `sync-calendar-events` worker runs right here too, same reasoning as sync-todoist above —
// pushing an already-extracted calendar event has no Mac-local constraint either. Deliberately
// independent of the library sync block below even though both ultimately talk to the same
// Google Calendar credential (#343): gating this on WBPG being configured too would mean an
// email-derived event could never reach the calendar on an install that has no library sync set
// up at all. Optional at startup like Todoist above — the Jobs API still accepts
// `/calendar-event-jobs` either way, jobs just queue up unconsumed until the worker starts.
if (googleCalendarClientId && googleCalendarClientSecret && googleCalendarRefreshToken) {
  const calendarClient = createGoogleCalendarClient({
    clientId: googleCalendarClientId,
    clientSecret: googleCalendarClientSecret,
    refreshToken: googleCalendarRefreshToken,
    calendarId: googleCalendarId,
    timeZone: googleCalendarTimeZone,
  });

  // Same quota-protection reasoning as sync-todoist's limiter above, tuned by its own pair
  // of env vars rather than reusing Todoist's — the two APIs have separate quotas.
  const calendarEventsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  createCalendarEventsWorker(
    calendarEventsConnection,
    { calendarClient, events },
    {
      limiter: { max: calendarEventsRateLimitMax, duration: calendarEventsRateLimitDurationMs },
      logger: app.log,
    },
  );
} else {
  app.log.warn(
    "GOOGLE_CALENDAR_CLIENT_ID/GOOGLE_CALENDAR_CLIENT_SECRET/GOOGLE_CALENDAR_REFRESH_TOKEN not fully set — " +
      "sync-calendar-events worker not started, jobs will queue up unconsumed",
  );
}

// The `extract-action-items` worker runs right here too now, same shape as sync-todoist/
// sync-calendar-events above — it used to be a Mac-only LaunchAgent (worker.ts, #249/#251)
// because a local LM Studio call meant email content could never leave the user's machine; moved
// into this cloud process once extraction switched to OpenRouter, which is a cloud call regardless
// of where it's dispatched from (see openRouter.ts's header comment for that trade-off). Optional
// at startup like the others above — the Jobs API still accepts `POST /jobs` either way, jobs just
// queue up unconsumed until both credentials are configured.
if (gmailClientId && gmailClientSecret && gmailRefreshToken && openRouterApiKey) {
  const emailFetcher = createGmailFetcher({
    clientId: gmailClientId,
    clientSecret: gmailClientSecret,
    refreshToken: gmailRefreshToken,
  });
  const actionItemExtractor = createOpenRouterExtractor({
    apiKey: openRouterApiKey,
    model: openRouterModel,
    baseUrl: openRouterBaseUrl,
  });
  // On-disk inspection trail (see inspectionLog.ts) — on by default (`./audit`, resolved against
  // this process's cwd), same as the worker this replaced. Mostly useful when running `server.ts`
  // locally (`npm run review` reads it back); in a real Dokku deploy it just writes into the
  // container's ephemeral filesystem, harmless but not durable across redeploys. Set
  // WORKER_INSPECTION_DIR="" to turn it off entirely.
  const inspectionLogger: InspectionLogger = inspectionDir
    ? createFileInspectionLogger(inspectionDir)
    : noopInspectionLogger;

  // Same quota-protection reasoning as sync-todoist's/sync-calendar-events' limiters above — free
  // OpenRouter models enforce their own requests-per-minute ceiling, tuned by its own pair of env
  // vars since that ceiling has nothing to do with Todoist's or Google Calendar's quotas.
  const extractActionItemsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  createExtractActionItemsWorker(
    extractActionItemsConnection,
    { emailFetcher, actionItemExtractor, events, inspectionLogger },
    {
      limiter: {
        max: extractActionItemsRateLimitMax,
        duration: extractActionItemsRateLimitDurationMs,
      },
      logger: app.log,
    },
  );
} else {
  app.log.warn(
    "GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET/GMAIL_REFRESH_TOKEN/OPENROUTER_API_KEY not fully set — " +
      "extract-action-items worker not started, jobs will queue up unconsumed",
  );
}

// The library-loan -> Google Calendar sync workers run right here too, same reasoning as
// sync-todoist above: neither WBPG login nor Google Calendar needs anything Mac-local. (This used to
// be a separate Dokku process type, librarySyncWorker.ts, requiring a manual `dokku ps:scale`
// step that's easy to forget — folding it in here means it just comes up with "web", no scaling
// step needed, matching the one existing precedent instead of being the odd one out.)
//
// Optional at startup like Todoist above: the Jobs API and Bull Board still come up fine
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

  createLibraryRefreshWorker(
    new Redis(redisUrl, { maxRetriesPerRequest: null }),
    { libraryClient, store, syncQueue: librarySyncQueueAdapter, calendar },
    { logger: app.log },
  );

  createLibrarySyncWorker(
    new Redis(redisUrl, { maxRetriesPerRequest: null }),
    { store, calendar },
    { logger: app.log },
  );
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
