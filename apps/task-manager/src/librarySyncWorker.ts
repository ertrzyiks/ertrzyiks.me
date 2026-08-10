// Dokku worker entry point for the library-loan -> Google Calendar sync job. Unlike worker.ts
// (Mac-only, Keychain-backed secrets — see that file's header comment), this one runs on Dokku
// as a second process type alongside server.ts's Jobs API (see the Procfile), reading secrets
// from plain env vars the way server.ts already does. Neither WBPG login nor Google Calendar
// needs anything Mac-local, so there's no reason to tie this to the Mac worker's lifecycle.
//
// Registers one BullMQ repeatable job ("refresh") that periodically logs into WBPG, updates the
// local loans table, and fans out one `sync-loan-calendar` job per current loan — then runs two
// Workers: one consuming that refresh trigger, one consuming the per-loan sync jobs it produces.
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { createGoogleCalendarClient } from "./googleCalendar.js";
import { createLibraryClient } from "./library.js";
import { loadLibraryWorkerConfig } from "./libraryConfig.js";
import { refreshLibraryLoans } from "./libraryRefresh.js";
import { syncLoanCalendarEvent } from "./loanCalendarSync.js";
import {
  createLibraryRefreshQueue,
  createLibrarySyncQueue,
  createLoanSyncQueueAdapter,
  LIBRARY_REFRESH_QUEUE_NAME,
  LIBRARY_SYNC_QUEUE_NAME,
  type LoanSyncJobPayload,
} from "./librarySyncQueue.js";
import { createStore } from "./loansStore.js";

async function main() {
  const config = loadLibraryWorkerConfig();

  const store = createStore(config.databasePath);
  const libraryClient = createLibraryClient(config.wbpg);
  const calendar = createGoogleCalendarClient(config.googleCalendar);

  const refreshQueue = createLibraryRefreshQueue(config.redisUrl);
  const syncQueue = createLibrarySyncQueue(config.redisUrl);
  const syncQueueAdapter = createLoanSyncQueueAdapter(syncQueue);

  // upsertJobScheduler (not `queue.add(..., {repeat})`, deprecated in this BullMQ version) —
  // re-running this with the same scheduler id on every startup updates the schedule in place
  // rather than piling up duplicates, so it's safe to call unconditionally here.
  await refreshQueue.upsertJobScheduler(
    "refresh-library-loans-schedule",
    { pattern: config.refreshCronPattern, tz: "Europe/Warsaw" },
    { name: "refresh" },
  );

  const refreshWorker = new Worker(
    LIBRARY_REFRESH_QUEUE_NAME,
    async () => {
      const result = await refreshLibraryLoans({ libraryClient, store, syncQueue: syncQueueAdapter, calendar });
      console.log(
        `library refresh: ${result.loanCount} current loan(s), ` +
          `${result.removedCalendarEventGroups} stale calendar event group(s) removed`,
      );
    },
    { connection: new Redis(config.redisUrl, { maxRetriesPerRequest: null }) },
  );

  const syncWorker = new Worker<LoanSyncJobPayload>(
    LIBRARY_SYNC_QUEUE_NAME,
    async (job) => {
      await syncLoanCalendarEvent(job.data.holdingId, { store, calendar });
    },
    { connection: new Redis(config.redisUrl, { maxRetriesPerRequest: null }) },
  );

  for (const worker of [refreshWorker, syncWorker]) {
    worker.on("ready", () => console.log(`library sync worker ready, consuming "${worker.name}"`));
    worker.on("failed", (job, error) =>
      console.error(`Job ${job?.id ?? "<unknown>"} on "${worker.name}" failed:`, error),
    );
  }
}

main().catch((error) => {
  console.error("library sync worker failed to start:", error);
  process.exit(1);
});
