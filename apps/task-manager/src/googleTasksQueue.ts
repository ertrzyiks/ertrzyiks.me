// The BullMQ queue that syncs completed action items to Google Tasks, consumed by a second
// `Worker` started alongside the Jobs API server in server.ts (unlike `extract-action-items`,
// this queue's worker runs in the cloud — pushing an already-extracted action item has none of
// the "must never leave local processing" constraints that keep Gmail content-reading on the Mac
// worker, see worker.ts).
export const GOOGLE_TASKS_QUEUE_NAME = "sync-google-tasks";
