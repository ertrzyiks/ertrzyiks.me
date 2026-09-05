// Error monitoring via Sentry — a different concern from `axiomEvents.ts`'s business-level
// trend events (queued/active/completed/failed counts over time, viewed as a dashboard trend).
// Sentry answers "what broke and why" with a full stack trace, grouping, and alerting; this
// module just wires the SDK up once per process (`initSentry`, called once from `server.ts`,
// this package's only entrypoint now that every queue — including `extract-action-items`, formerly
// a separate Mac-only worker.ts entrypoint — runs inside it, see that queue's README section).
//
// Unlike `axiomEvents.ts`, this doesn't get its own hand-rolled `EventEmitter`-style
// interface/fake — the Sentry SDK already behaves like a no-op when `dsn` is unset
// (`Sentry.init` skips creating a client, and `Sentry.captureException` becomes a safe no-op
// against no client), so there's nothing to hand-roll. Call `initSentry()` once at startup, then
// call `Sentry.captureException(...)` directly wherever an error needs reporting, re-exported
// from here so call sites don't need their own `@sentry/node` import.
//
// Deliberately *not* wired into every per-item try/catch this package already has (e.g. inside
// `todoistJobProcessor.ts`/`jobProcessor.ts`'s own catch blocks) — those already throw back
// out to the `bullmq.Worker` that's running them, which is where capture actually happens (see
// the `worker.on("failed", ...)` handler each queue's own worker.ts registers): one capture per job
// failure, not one per failure *site* inside a job. Scoped this way so a burst of failures from
// one root cause doesn't multiply against Sentry's free-tier event quota.
import * as Sentry from "@sentry/node";

export { Sentry };

/**
 * A Sentry DSN only grants write access to one project's event stream (in fact DSNs are routinely
 * embedded in client-side/browser code, since they're not considered secret), so this is a plain,
 * optional env var like every other credential in this service — a no-op until it's set.
 */
export function initSentry(dsn: string | undefined): void {
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Error-only: no performance/tracing spans. Keeps this lightweight (in the spirit of #294/
    // #295's "free, lightweight" scope for this pair of services) and avoids burning through the
    // free tier's event quota on trace data nobody's asked to see.
    tracesSampleRate: 0,
    // Sentry defaults `environment` to "production" when unset, and this package has no
    // reliable NODE_ENV signal to derive it from (NODE_ENV is only ever set to "test" by vitest
    // here — see app.ts). SENTRY_ENVIRONMENT is an escape hatch for anyone deliberately pointing
    // a real DSN at this from a non-production run (e.g. local smoke-testing).
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
  });
}
