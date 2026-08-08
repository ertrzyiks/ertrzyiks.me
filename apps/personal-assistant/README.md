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

1. `messages.list` against Gmail → message IDs.
2. Dedup against the `emails` table — only IDs not already recorded are new.
3. For each new ID: insert into `emails` with `status='queued'`, then `POST /jobs { emailId }`
   against the Jobs API. If scheduling fails, the email is marked `status='failed'` right away
   (retry/alerting policy is deferred — see Tasks in #250).
4. For every email still `status='queued'` with a job attached: `POST /jobs/status` (batched) to
   check progress. On `completed`, the returned action items are inserted into `action_items` and
   the email is marked `status='completed'`. On `failed`, the email is marked `status='failed'`
   with `error_message` set. `pending`/`active` jobs are left alone until the next cycle.

## SQLite schema

Exactly as specified in [#242](https://github.com/ertrzyiks/ertrzyiks.me/issues/242), created at
startup if missing:

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
  created_at TEXT NOT NULL
);
```

## Environment variables

| Variable                | Required | Description                                                                 |
| ------------------------ | -------- | ----------------------------------------------------------------------------- |
| `GMAIL_CLIENT_ID`         | yes      | OAuth client ID for the shared `gmail.readonly` credential                    |
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

Polling frequency and retry/alerting policy are explicitly deferred per #250 — the above are
reasonable starting defaults, expected to be revisited.

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
