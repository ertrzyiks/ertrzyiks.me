import type { BackoffStrategy, DefaultJobOptions } from "bullmq";

// Shared retry policy (#348, extended for #370 to bound retries by wall-clock time rather than
// attempt count) for every queue in this app — `extract-action-items`, `sync-todoist`,
// `sync-calendar-events`, `refresh-library-loans`, `sync-loan-calendar` (see each module's
// queue.ts, which passes DEFAULT_JOB_OPTIONS as `defaultJobOptions`, and worker.ts, which passes
// `backoffStrategy` as `settings.backoffStrategy`). One place to tune instead of five queues
// drifting apart.

// 10s before the first retry, doubling from there (10s, 20s, 40s, …) — spaces retries out
// instead of hammering an API that's already erroring (e.g. rate limiting) again immediately.
const INITIAL_DELAY_MS = 10_000;

// Caps a single hop at 24h so a job that's been failing for a while still gets checked roughly
// once a day, instead of the raw exponential curve leaving it idle for multiple days between the
// last couple of attempts before the 7-day window runs out.
const MAX_DELAY_MS = 24 * 60 * 60 * 1000;

// A job stops retrying once it has been failing for longer than this, however many attempts it
// has used — this is what actually bounds retries to 7 days instead of forever.
export const MAX_RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// `attempts` only needs to be large enough that BullMQ's own `attemptsMade + 1 < attempts` gate
// (see bullmq's Job#shouldRetryJob) never cuts a retry short before backoffStrategy's own 7-day
// window does — the real cutoff lives entirely in backoffStrategy below. Even at the capped 24h
// hop, the 7-day window can't use more than ~8 attempts, so this is a generous ceiling above it.
const MAX_ATTEMPTS = 1000;

// `defaultJobOptions` (#348) — set on every queue.ts via `createQueue`.
//
// `backoff: { type: "custom" }` routes retries through `backoffStrategy` below instead of
// BullMQ's built-in "exponential" strategy: only a custom strategy gets to see the job (and so
// its creation timestamp) and decide when the 7-day window is up.
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: "custom" },
};

// The custom backoff strategy matching DEFAULT_JOB_OPTIONS' `backoff: { type: "custom" }` above.
// Register it as `settings: { backoffStrategy }` on every worker.ts's `Worker` — a custom backoff
// function can only be supplied there, not on the Queue (`Queue`-level `defaultJobOptions.backoff`
// can only *name* a strategy by `type`; see
// https://docs.bullmq.io/guide/retrying-failing-jobs#custom-backoff-strategy).
//
// Exponential, doubling from INITIAL_DELAY_MS and capped at MAX_DELAY_MS per hop, same shape as
// before (#348) — except once the job has already been retrying for MAX_RETRY_WINDOW_MS (7 days),
// it returns -1, which tells BullMQ to stop retrying and move the job to `failed` for good
// instead of scheduling another attempt.
export const backoffStrategy: BackoffStrategy = (attemptsMade, _type, _err, job) => {
  const createdAt = job?.timestamp ?? Date.now();
  const elapsed = Date.now() - createdAt;

  if (elapsed >= MAX_RETRY_WINDOW_MS) {
    return -1;
  }

  return Math.min(INITIAL_DELAY_MS * 2 ** (attemptsMade - 1), MAX_DELAY_MS);
};
