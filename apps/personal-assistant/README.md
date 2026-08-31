# personal-assistant

Orchestration service for the email → action-items automation (see [#250](https://github.com/ertrzyiks/ertrzyiks.me/issues/250)).
Polls Gmail for new message IDs, schedules action-item extraction jobs against the Jobs API
(`apps/task-manager`), and stores the results in SQLite. No UI — this is a background poller;
the SQLite database it writes to is the queryable end product.

The Mac worker that actually extracts action items from email content (colocated in
`apps/task-manager`, see [#249](https://github.com/ertrzyiks/ertrzyiks.me/issues/249)) is a
separate, standalone process — this service only ever calls Gmail's `messages.list`, never a
content-fetching endpoint, even though the shared `gmail.readonly` credential is technically
capable of it (see [#236](https://github.com/ertrzyiks/ertrzyiks.me/issues/236)).

## Flow

For each poll cycle:

1. `messages.list` against Gmail, filtered to `q: "is:important"` → message IDs. Gmail marks
   messages important itself (an ML classifier informed by the account's read/reply/star/archive
   history) and a user can override that per-message via "Mark as important"/"Mark as not
   important" — `is:important` reflects both, so scoping to it keeps this service from scheduling
   a job for every message that lands in the mailbox.
2. Dedup against the `emails` table — only IDs not already recorded are new.
3. For each new ID: insert into `emails` with `status='queued'`, then `POST /jobs { emailId }`
   against the Jobs API. If scheduling fails, the email is marked `status='failed'` right away
   (retry/alerting policy is deferred — see Tasks in #250).
4. For every email still `status='queued'` with a job attached: `POST /jobs/status` (batched) to
   check progress. On `completed`, the returned action items are inserted into `action_items` and
   the email is marked `status='completed'`. On `failed`, the email is marked `status='failed'`
   with `error_message` set. `pending`/`active` jobs are left alone until the next cycle.
5. Google Tasks sync (`src/googleTasksSyncer.ts`), same cycle: for every action item with no
   `job_id` yet, `POST /google-tasks-jobs` against the Jobs API's `sync-google-tasks` queue and
   record the returned job ID. For every action item with a `job_id` but no `task_id` yet,
   `POST /google-tasks-jobs/status` (batched) and, on `completed`, backfill `task_id` with the
   Google Tasks task ID. A scheduling failure leaves `job_id` unset (retried next cycle); a job
   failure is logged and left stuck (`job_id` set, `task_id` never filled) — this feature has no
   per-item error column, unlike `emails.error_message`, so both are best-effort rather than a
   real retry/alerting policy (same "explicitly deferred" stance as step 3 above).

## SQLite schema

Exactly as specified in [#242](https://github.com/ertrzyiks/ertrzyiks.me/issues/242), plus
`job_id`/`task_id` on `action_items` for the Google Tasks sync loop above. Created (and migrated,
for `job_id`/`task_id` on a database file that predates them) at startup:

```sql
CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | completed | failed
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT NOT NULL REFERENCES emails(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',    -- open | done
  created_at TEXT NOT NULL,
  job_id TEXT,                            -- sync-google-tasks job ID, once scheduled
  task_id TEXT                            -- Google Tasks task ID, once the job completes
);
```

The `job_id`/`task_id` migration (`migrateActionItemsColumns` in `store.ts`) stamps every
pre-existing row (anything that existed before the two columns did) with a `"pre-existing-skip-sync"`
sentinel in both columns, rather than leaving them genuinely `NULL`. Without that, the very first
startup after this feature shipped would read the *entire* historical backlog as unsynced and
schedule a sync job for all of it at once — which is both semantically wrong (nobody asked for
months of old action items to show up in Google Tasks) and what actually tripped a Google Tasks
API "quota exceeded" error in production. The sentinel value is never a real job/task ID; it just
permanently excludes the row from both `getUnsyncedActionItems` and `getActionItemsAwaitingTaskSync`.
A genuinely new action item's `job_id`/`task_id` stay `NULL` until the sync loop actually touches
them, so this only affects rows that predate the migration.

## Environment variables

| Variable                | Required | Description                                                                 |
| ------------------------ | -------- | ----------------------------------------------------------------------------- |
| `GMAIL_CLIENT_ID`         | yes      | OAuth client ID for the `gmail.readonly` credential (shared across gmail/tasks/calendar, #343) |
| `GMAIL_CLIENT_SECRET`     | yes      | OAuth client secret                                                           |
| `GMAIL_REFRESH_TOKEN`     | yes      | OAuth refresh token                                                           |
| `JOBS_API_BASE_URL`       | yes      | Base URL of the task-manager Jobs API                                         |
| `JOBS_API_BEARER_TOKEN`   | yes      | Bearer token sent as `Authorization: Bearer <token>` on every Jobs API call    |
| `DATABASE_PATH`           | no       | Path to the SQLite file (default `/app/data/personal-assistant.sqlite`, matching the `storage` mount in `terraform/main.tf`'s `dokku_app.personal_assistant`) |
| `POLL_INTERVAL_MS`        | no       | Milliseconds between poll cycles (default `300000`, i.e. 5 minutes)           |
| `GMAIL_MAX_RESULTS`       | no       | Max messages fetched per `messages.list` call (default `50`)                  |
| `PORT`                    | no       | HTTP port for the health/dashboard server (default `3000`)                    |
| `PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_USERNAME` | yes | Basic Auth username guarding the snapshot dashboard (`/admin/status`) |
| `PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_PASSWORD` | yes | Basic Auth password guarding the snapshot dashboard |
| `AXIOM_TOKEN`             | no\*     | Axiom API token for trend-event ingestion (#315)                              |
| `AXIOM_DATASET`           | no\*     | Axiom dataset to ingest into (e.g. `personal-assistant-events`)               |
| `SENTRY_DSN`              | no       | Sentry DSN for error monitoring (see "Error monitoring" below)                |
| `SENTRY_ENVIRONMENT`      | no       | Overrides the `environment` tag Sentry events are reported under (default `production`) |

Polling frequency and retry/alerting policy are explicitly deferred per #250 — the above are
reasonable starting defaults, expected to be revisited.

\* Both optional, and independent of each other (unlike the dashboard Basic Auth pair above,
which requires both-or-neither) — `poller.ts` just doesn't emit trend events until both are set;
everything else about the poll cycle is unaffected. See "Historical/trend observability" below.

## HTTP surface

personal-assistant is mostly a background poller with no meaningful inbound traffic, but it runs
one small HTTP server (`src/healthServer.ts`) alongside the poll loop so Dokku's proxy has
something to route its domain to:

- `GET /health` — `200 { status: "ok" }` whenever the process is up. No dependency check (Gmail,
  Jobs API, sqlite) behind it, just liveness. Unauthenticated.
- `GET /admin/status` — a snapshot dashboard: current `emails` counts by status, and the 50 most
  recently updated failed emails with their `error_message` (#297/#312). Guarded by Basic Auth
  (`WWW-Authenticate: Basic` challenge on a failed/missing check) — a separate scheme from the
  Jobs API's Bearer token, chosen so the dashboard is reachable from a plain browser tab.

## Historical/trend observability (#315)

`/admin/status` above is a **snapshot** — current counts, right now. It deliberately doesn't show
trends over time (a failure spike an hour ago, a slow week). That's what
[Axiom](https://axiom.co) is for: `src/axiomEvents.ts` fire-and-forget POSTs a `{ service: "personal-assistant", entity: "email", entityId, status, _time, error? }`
event to Axiom's ingest API at each of `poller.ts`'s existing `store.ts` call sites —
`queued` (`insertQueuedEmail`), `completed` (`markEmailCompleted`), `failed`
(`markEmailFailed`, from either a scheduling failure or a failed Jobs API result). No new state
machine; this rides transitions the poller already makes.

Fully best-effort: `emit()` never throws or awaits into the poll cycle it's describing (fire the
request, log-and-swallow any failure via the existing `Logger`) — a dropped event from a brief
Axiom outage is an acceptable gap in a 30-day trends view, not a poll-cycle failure. A no-op
(`noopEventEmitter`) until both `AXIOM_TOKEN`/`AXIOM_DATASET` are set (see the env var table
above) — this is purely additive, task-manager's own `task-manager-events` dataset is separate
(see its README), and Axiom's own account-login dashboard is the intended way to view this, not
a Basic-Auth-guarded view here.

## Error monitoring (Sentry)

Axiom above answers "how many emails failed, and when" — a trend, not a stack trace.
`src/sentry.ts` wires up [Sentry](https://sentry.io) to answer the complementary question, "what
broke and why": `initSentry(config.sentryDsn)` is called once near the top of `server.ts`
(`devServer.ts` delegates to it, so local dev gets it too whenever `SENTRY_DSN` is set).

Wired at a few boundaries, not into every internal try/catch:

- Global uncaught-exception/unhandled-rejection handlers — installed automatically by
  `Sentry.init` itself, no extra code here.
- `runner.ts`'s outer per-cycle catch — reached only when something breaks `runPollCycle` as a
  whole, not the routine per-email/per-action-item failures `poller.ts`/`googleTasksSyncer.ts`
  already swallow internally (those are tracked via `emails.status`/`error_message` in SQLite,
  and for `poller.ts`'s two sites, an Axiom trend event too — genuinely handled outcomes, not
  bugs).
- `healthServer.ts`'s `/admin/status` route: rendering the snapshot (a `Store` read) is now
  caught before any response headers are sent, so a query failure reports to Sentry and replies
  `500` instead of taking down the whole process — this is a plain `node:http` listener callback,
  with no framework-level error handling like task-manager's Fastify gets.

Same no-op-until-configured treatment as Axiom: `Sentry.init`/`Sentry.captureException` are safe
no-ops with no `SENTRY_DSN` set (see `sentry.ts`'s header comment) — this is purely additive, and
task-manager has its own separate Sentry project (see its README), matching the same
one-project-per-service split Axiom already uses.

## Development

```bash
pnpm install
pnpm --filter personal-assistant test
```

### Local dev workflow

1. Copy the env file and fill in real (or throwaway) values:

   ```bash
   cp apps/personal-assistant/.env.example apps/personal-assistant/.env
   ```

2. To exercise this against a real Jobs API locally, bring up `apps/task-manager`'s dev
   dependencies (see its README) and point `JOBS_API_BASE_URL`/`JOBS_API_BEARER_TOKEN` at it.

3. Run the dev entrypoint:

   ```bash
   pnpm --filter personal-assistant dev
   ```

   This runs `src/devServer.ts`, which loads `apps/personal-assistant/.env` (via `dotenv`) before
   delegating to the same wiring the production entrypoint uses. The production entrypoint
   (`src/server.ts`, what Dokku runs via `pnpm start`) never depends on `dotenv`.

## Design notes

- `GmailClient` and `JobsApiClient` (`src/gmailClient.ts`, `src/jobsApiClient.ts`) are small
  interfaces, each with a real implementation (backed by `googleapis` / `fetch`) and used against
  fakes in tests — the poll → schedule → poll-status → store flow (`src/poller.ts`) is unit-tested
  without touching real Gmail OAuth or a real task-manager server.
- The SQLite store (`src/store.ts`) uses Node's built-in `node:sqlite` rather than a native-addon
  driver, and is tested directly against a real (in-memory or temp-file) database rather than a
  fake, since it's fast, synchronous, and local.
- `src/googleTasksSyncer.ts` (schedule-unsynced / poll-pending / run-cycle) structurally mirrors
  `src/poller.ts`'s email flow, reusing the same `JobsApiClient`/`Store` — `runPollCycle` just
  calls both. `src/logger.ts` holds the shared `Logger`/`noopLogger` (split out of `poller.ts`)
  so `googleTasksSyncer.ts` can use them without poller.ts/googleTasksSyncer.ts importing each
  other.
