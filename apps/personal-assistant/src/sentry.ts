// Error monitoring via Sentry — a different concern from `axiomEvents.ts`'s business-level
// trend events (queued/completed/failed counts over time, viewed as a dashboard trend). Sentry
// answers "what broke and why" with a full stack trace, grouping, and alerting; this module just
// wires the SDK up once per process (`initSentry`, called from `server.ts`, this package's only
// production entrypoint — `devServer.ts` delegates to it).
//
// Unlike `axiomEvents.ts`, this doesn't get its own hand-rolled `EventEmitter`-style
// interface/fake — the Sentry SDK already behaves like a no-op when `dsn` is unset
// (`Sentry.init` skips creating a client, and `Sentry.captureException` becomes a safe no-op
// against no client), so there's nothing to hand-roll. Call `initSentry()` once at startup, then
// call `Sentry.captureException(...)` directly wherever an error needs reporting, re-exported
// from here so call sites don't need their own `@sentry/node` import.
//
// Deliberately *not* wired into every per-item try/catch this package already has (e.g. inside
// `poller.ts`/`todoistSyncer.ts`'s own catch blocks for a single email/action item) — those
// are expected, already-tracked business outcomes (stored as `status='failed'`/`error_message`
// in SQLite, and for `poller.ts`'s two sites, also an Axiom trend event), not bugs. Scoped
// instead to the poll cycle's own outer catch (`runner.ts`) and this package's small HTTP
// surface (`healthServer.ts`) — genuine unexpected failures, not routine per-item outcomes —
// plus uncaught exceptions/unhandled rejections process-wide, which Sentry's default
// integrations install automatically on `init`.
import * as Sentry from "@sentry/node";

export { Sentry };

/**
 * Deliberately a plain, optional field on `Config` rather than Keychain/1Password-gated like
 * this package's other credentials — same reasoning `axiomEvents.ts`'s header comment gives for
 * `AXIOM_TOKEN`: a Sentry DSN only grants write access to one project's event stream (DSNs are
 * routinely embedded in client-side/browser code, since they're not considered secret), a lower
 * blast radius than this service's other credentials.
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
    // reliable NODE_ENV signal to derive it from. SENTRY_ENVIRONMENT is an escape hatch for
    // anyone deliberately pointing a real DSN at this from a non-production run (e.g. local
    // smoke-testing).
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
  });
}
