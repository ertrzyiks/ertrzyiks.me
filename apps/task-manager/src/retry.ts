import type { DefaultJobOptions } from "bullmq";

// Shared retry policy (#348) for every queue in this app — `extract-action-items`,
// `sync-google-tasks`, `refresh-library-loans`, `sync-loan-calendar` (see queue.ts and
// librarySyncQueue.ts, both of which pass this as `defaultJobOptions`). One place to tune instead
// of four queues drifting apart.
//
// `attempts: 3` — a job is tried up to 3 times total (the original run plus 2 retries) before
// BullMQ marks it `failed` for good and the "failed" trend event/Sentry report fires. Guards
// against the transient failures these jobs are actually prone to — a flaky Gmail/Google
// Tasks/WBPG/Google Calendar API call, LM Studio warming up — without silently retrying a job
// that's failing for a real, non-transient reason (a malformed payload, an expired OAuth token)
// forever.
//
// `backoff: exponential, delay: 10_000` — waits 10s before the first retry, 20s before the
// second, spacing retries out instead of hammering an API that's already erroring (e.g. rate
// limiting) again immediately.
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
};
