# task-manager

Jobs API server for the email → action-items automation (see [#248](https://github.com/ertrzyiks/ertrzyiks.me/issues/248)).
Exposes the BullMQ + Redis queue over HTTP for `personal-assistant` to schedule action-item
extraction jobs and poll their status/result.

The Mac worker that actually processes jobs (`src/worker.ts`, colocated in this package per #245,
built in #249) consumes the same queue. It never runs on Dokku/CI — it's started locally on the
user's Mac (via a LaunchAgent, see #243) and is the only thing that ever reads email content.

Two more queues run right here in `server.ts` (cloud), unlike `extract-action-items` — neither has
the "must never leave local processing" constraint that keeps the Mac worker on the Mac:

- `sync-google-tasks` keeps `personal-assistant`'s `action_items` table in sync with Google Tasks.
  See "Google Tasks sync" below.
- `sync-loan-calendar` (plus `refresh-library-loans`, which feeds it) keeps a Google Calendar
  event in sync with every currently-borrowed library book's return date. See "Library loan ->
  Google Calendar sync" below.

## Environment variables

### Jobs API server (`server.ts`)

| Variable                                        | Required | Description                                              |
| ------------------------------------------------ | -------- | ---------------------------------------------------------- |
| `REDIS_URL`                                       | yes      | Connection string for the BullMQ-backing Redis instance    |
| `JOBS_API_BEARER_TOKEN`                           | yes      | Shared secret every request must present as `Authorization: Bearer <token>` |
| `PORT`                                            | no       | HTTP port to listen on (default `3000`)                    |
| `TASK_MANAGER_BULL_BOARD_BASIC_AUTH_USERNAME`     | no\*     | Basic Auth username guarding the Bull Board UI (`/admin/queues`) |
| `TASK_MANAGER_BULL_BOARD_BASIC_AUTH_PASSWORD`     | no\*     | Basic Auth password guarding the Bull Board UI              |
| `GOOGLE_TASKS_CLIENT_ID`                          | no\*\*   | OAuth client id for the `sync-google-tasks` worker's `tasks` credential (shared across gmail/tasks/calendar, #343) |
| `GOOGLE_TASKS_CLIENT_SECRET`                      | no\*\*   | OAuth client secret for the same credential                 |
| `GOOGLE_TASKS_REFRESH_TOKEN`                      | no\*\*   | Refresh token for the same credential (from `scripts/google-tasks-oauth`) |
| `GOOGLE_TASKS_LIST_ID`                            | no       | Google Tasks list to create tasks in (default `@default`, the user's default list) |
| `GOOGLE_TASKS_RATE_LIMIT_MAX`                     | no       | Max `sync-google-tasks` jobs processed per `GOOGLE_TASKS_RATE_LIMIT_DURATION_MS` window (default `5`) |
| `GOOGLE_TASKS_RATE_LIMIT_DURATION_MS`             | no       | Window length in ms for the rate limit above (default `1000`)|
| `WBPG_USERNAME`                                   | no\*\*\* | WBPG library card number / login, for the library sync workers                |
| `WBPG_PASSWORD`                                   | no\*\*\* | WBPG password                                                                 |
| `GOOGLE_CALENDAR_CLIENT_ID`                       | no\*\*\* | OAuth client id for the `calendar.events` credential (shared across gmail/tasks/calendar, #343) |
| `GOOGLE_CALENDAR_CLIENT_SECRET`                   | no\*\*\* | OAuth client secret for the same credential                                   |
| `GOOGLE_CALENDAR_REFRESH_TOKEN`                   | no\*\*\* | Refresh token for the same credential                                         |
| `DATABASE_PATH`                                   | no       | Where the sqlite loans DB lives (default `/app/data/library.sqlite`, matching the Dokku storage mount — see terraform/main.tf) |
| `WBPG_BASE_URL`                                   | no       | Overrides the WBPG catalog base URL (default `https://katalog.wbpg.org.pl`)   |
| `GOOGLE_CALENDAR_ID`                              | no       | Which calendar to write to (default `primary`, i.e. the refresh token's own account's main calendar) |
| `GOOGLE_CALENDAR_TIMEZONE`                        | no       | IANA zone events are created in (default `Europe/Warsaw`)                     |
| `LIBRARY_REFRESH_CRON_PATTERN`                    | no       | Cron pattern for how often to re-check WBPG (default `0 7 * * *`, daily 07:00 Europe/Warsaw) |
| `AXIOM_TOKEN`                                     | no       | Axiom API token for trend-event ingestion (#315), used by the `sync-google-tasks` worker here |
| `AXIOM_DATASET`                                   | no       | Axiom dataset to ingest into (e.g. `task-manager-events`)                     |

\* Bull Board is always mounted, but the Basic Auth check only applies when **both** vars are set —
unset (the default locally) leaves it open. Production always sets both via Terraform (#313).

\*\* The `sync-google-tasks` worker (started inside this same process, see below) only starts
once all three are set. Unset — the state before `scripts/google-tasks-oauth` has been run once —
the Jobs API still accepts `/google-tasks-jobs` requests, they just queue up unconsumed until the
worker starts.

\*\*\* The `refresh-library-loans`/`sync-loan-calendar` workers (also started inside this same
process) only start once all five are set — same optional-at-startup pattern as the Google Tasks
vars above. Unset, Bull Board still shows both queues (registered unconditionally so its "Add Job"
button always works — see `bullBoard.ts`), jobs just queue up unconsumed until the workers start.

`AXIOM_TOKEN`/`AXIOM_DATASET` are independent of each other and of everything above — see
"Historical/trend observability" below.

## Google Tasks sync

`POST /google-tasks-jobs` schedules a job on the `sync-google-tasks` queue, consumed by a second
`bullmq.Worker` started alongside the Jobs API server in `server.ts` (`src/googleTasksJobProcessor.ts`
→ `src/googleTasksClient.ts`, wrapping the Google Tasks API). `personal-assistant`'s sync loop
(`src/googleTasksSyncer.ts`) is the only caller: it schedules a job for each action item without
a `job_id` yet, then polls for completion and backfills `task_id` — see that package's README for
the full loop.

This worker's refresh token is separate from the Mac worker's `gmail.readonly` one — provisioned
via `scripts/google-tasks-oauth`, read from plain env vars (not the macOS Keychain, since this
worker runs in the cloud) via Terraform/1Password in production. The OAuth client id/secret
(`GOOGLE_TASKS_CLIENT_ID`/`_SECRET`), however, are the same shared Google Cloud OAuth client used
by `GMAIL_CLIENT_ID`/`_SECRET` and `GOOGLE_CALENDAR_CLIENT_ID`/`_SECRET` — one client can mint
refresh tokens for multiple scopes, so all three flows share one 1Password item
(`personal_assistant_google_oauth_client`, #343) instead of each keeping a duplicate copy of the
same value.

The worker's `Worker` is configured with a `limiter` (`GOOGLE_TASKS_RATE_LIMIT_MAX`/`_DURATION_MS`
above) so a burst of scheduled jobs drains onto the Tasks API gradually instead of all at once —
added after hitting a real "quota exceeded" error from a burst of jobs. A malformed `due` date
(the extracted action item's `dueDate` has no enforced format — see `lmStudio.ts`) no longer fails
task creation outright either: `googleTasksClient.ts` drops it rather than sending Google a value
it'll reject with "Request contains an invalid argument", so the task is still created, just
without a due date.

### Mac worker (`worker.ts`)

| Variable                 | Required | Description                                                                 |
| ------------------------- | -------- | ----------------------------------------------------------------------------- |
| `REDIS_URL`               | no\*     | Same Redis instance as the Jobs API server                                    |
| `GMAIL_CLIENT_ID`         | no\*     | OAuth client id for the worker's `gmail.readonly` credential (#236; shared across gmail/tasks/calendar, #343) |
| `GMAIL_CLIENT_SECRET`     | no\*     | OAuth client secret for the same credential                                   |
| `GMAIL_REFRESH_TOKEN`     | no\*     | Refresh token for the same credential (from `scripts/gmail-oauth`)            |
| `GMAIL_KEYCHAIN_SERVICE`  | no       | macOS Keychain "service" all four secrets above are read from (default `task-manager-worker`) |
| `GMAIL_KEYCHAIN_ACCOUNT`  | no       | macOS Keychain "account" the refresh token specifically is read from (default `gmail-refresh-token`) |
| `LM_STUDIO_BASE_URL`      | no       | Base URL of the local LM Studio server (default `http://localhost:1234`)      |
| `WORKER_FAKE_DEPS`        | no       | `"true"` swaps in canned fake Gmail/LM Studio implementations instead of the real ones — **manual smoke-testing only, never set in production** (see below) |
| `AXIOM_TOKEN`             | no\*\*   | Axiom API token for trend-event ingestion (#315), used by `extract-action-items` jobs here |
| `AXIOM_DATASET`           | no\*\*   | Axiom dataset to ingest into (e.g. `task-manager-events`, same dataset the cloud side uses) |

\* All four secrets are read from the macOS Keychain if not set as env vars (see `resolveSecret`
in `src/keychain.ts`) — the production LaunchAgent sets none of them and relies entirely on the
Keychain. Setting them as env vars is a **local dev/CI convenience only** (this repo's Linux
sandbox has no Keychain to fall back to); never set them in the LaunchAgent plist, which would put
them back in plaintext. This includes `GMAIL_REFRESH_TOKEN` — the most sensitive of the four — so
only set it locally when you actually need to exercise a real Gmail credential outside the
Keychain; `WORKER_FAKE_DEPS=true` is the lower-stakes option when you just need to prove the queue
wiring works.

\*\* Deliberately *not* Keychain-backed like the four above, despite also being a credential — an
Axiom ingest token only grants write access to one dataset, a meaningfully lower blast radius than
this worker's other secrets, so the extra Keychain rotation machinery isn't worth it here (see
`axiomEvents.ts`'s header comment). Plain, optional env vars; the LaunchAgent plist sets no
`EnvironmentVariables` at all today, so wiring these into production would mean adding that block —
not done, since this is additive and the Mac side isn't the primary way this gets exercised (see
"Historical/trend observability" below).

The worker reads all four secrets — the Gmail refresh token, `REDIS_URL`, `GMAIL_CLIENT_ID`, and
`GMAIL_CLIENT_SECRET` — from the **macOS Keychain** at startup by shelling out to the `security`
CLI (`security find-generic-password -a <account> -s <service> -w`, see `src/keychain.ts`). **This
is macOS-only** — there is no cross-platform Node API for the Keychain — and the real Keychain read
has never been exercised in this repo's CI or in the sandbox this worker was developed in, both of
which are Linux. Likewise, the LM Studio HTTP call (`src/lmStudio.ts`) talks to a real local server
that isn't running in CI/sandbox either. Both are built behind small seams (`EmailFetcher`,
`ActionItemExtractor`) so `src/jobProcessor.ts` — the actual "handle one job" logic — is
unit-tested with fakes, independent of Keychain/Gmail/LM Studio availability. See the PR that
introduced this file for what was and wasn't verified end-to-end.

## Historical/trend observability (#315)

Bull Board (above) is a **live/snapshot** view — current queue state, right now, plus retry/
inspect. It deliberately doesn't show trends over time (a failure spike an hour ago, a stalled
queue overnight). That's what [Axiom](https://axiom.co) is for: `src/axiomEvents.ts`
fire-and-forget POSTs a `{ service: "task-manager", entity, entityId, status, _time, error? }`
event to Axiom's ingest API at each job's `active`/`completed`/`failed` transition — emitted
inline in `jobProcessor.ts` (`entity: "extract-action-items"`, `entityId` = the email id) and
`googleTasksJobProcessor.ts` (`entity: "sync-google-tasks"`, `entityId` = the action item id),
right where each transition already happens, rather than a separate BullMQ `QueueEvents`
Redis-pubsub listener — simpler, no new listener lifecycle to manage.

Fully best-effort: `emit()` never throws or awaits into the job pipeline it's describing (fire the
request, log-and-swallow any failure via `console.error` — this package has no logger abstraction
today) — a dropped event from a brief Axiom outage is an acceptable gap in a 30-day trends view,
not a job failure. A no-op (`noopEventEmitter`) until both `AXIOM_TOKEN`/`AXIOM_DATASET` are set
(see the env var tables above) — this is purely additive on both the Mac worker and cloud sides.
Both processes share the same `task-manager-events` Axiom dataset (`personal-assistant` has its
own separate one, `personal-assistant-events` — see that package's README); the `entity` field is
what distinguishes `extract-action-items` from `sync-google-tasks` jobs within it.

## Endpoints

All `/jobs*` and `/google-tasks-jobs*` endpoints require `Authorization: Bearer <JOBS_API_BEARER_TOKEN>`.

- `POST /jobs` — `{ emailId }` → `201 { jobId }`
- `GET /jobs/:jobId` — `200 { jobId, status, result?, error? }`, `404` if unknown
- `POST /jobs/status` — `{ jobIds: [...] }` → `200 { results: [{ jobId, status, result?, error? }, ...] }` (unknown job IDs are omitted from `results`)
- `POST /google-tasks-jobs` — `{ actionItemId, title, description?, dueDate? }` → `201 { jobId }`
- `GET /google-tasks-jobs/:jobId` — `200 { jobId, status, result?, error? }` (`result` is `{ actionItemId, googleTaskId }` on success), `404` if unknown
- `POST /google-tasks-jobs/status` — `{ jobIds: [...] }` → `200 { results: [...] }`, same shape as `/jobs/status`

`status` is one of `pending | active | completed | failed`, collapsing BullMQ's internal states
per the contract in #241.

The [Bull Board](https://github.com/felixmosh/bull-board) queue-inspection UI is mounted at
`/admin/queues` — a separate, browser-friendly Basic Auth scheme guards it instead (#296), not the
Bearer token above.

## Development

```bash
pnpm install
pnpm --filter task-manager test
```

### Local dev workflow

1. Copy the env file and adjust the bearer token if you like:

   ```bash
   cp apps/task-manager/.env.example apps/task-manager/.env
   ```

2. Start a local Redis container (via `docker-compose.yml`, scoped to this package, no auth —
   dev-only, unrelated to the real Redis instance provisioned via Terraform):

   ```bash
   pnpm --filter task-manager dev:redis
   ```

3. Run the dev server:

   ```bash
   pnpm --filter task-manager dev
   ```

   This runs `src/server.ts` — the same entrypoint Dokku runs in production (via `pnpm start` →
   `node dist/server.js`). It loads `apps/task-manager/.env` (via `dotenv`, a no-op when no `.env`
   file exists, which is why this is safe to do unconditionally in production too) and always
   mounts the [Bull Board](https://github.com/felixmosh/bull-board) queue-inspection UI.

4. Open the queue UI at **http://localhost:3000/admin/queues**. If you left
   `TASK_MANAGER_BULL_BOARD_BASIC_AUTH_USERNAME`/`_PASSWORD` unset in `.env`, it's open with no
   prompt; set both to test the same Basic Auth flow production uses. Post a job and watch it show
   up — the `/jobs` API itself still uses the separate Bearer scheme:

   ```bash
   curl -X POST http://localhost:3000/jobs \
     -H "Authorization: Bearer local-dev-token" \
     -H "Content-Type: application/json" \
     -d '{"emailId":"email-123"}'
   ```

5. When you're done, stop the Redis container:

   ```bash
   pnpm --filter task-manager dev:redis:down
   ```

### Running the worker locally

With Redis up (`pnpm --filter task-manager dev:redis`), the worker can be run against real
Gmail/LM Studio (macOS for the local LM Studio call; the Gmail credential works anywhere once
`GMAIL_REFRESH_TOKEN` is set, no Keychain required) or, for smoke-testing the queue wiring itself
anywhere (including this sandbox), against fakes:

```bash
# Real Gmail + LM Studio (LM Studio itself is macOS only; all Gmail secrets via env vars,
# bypassing the Keychain entirely — see the env var table above)
REDIS_URL=redis://localhost:6379 \
GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... GMAIL_REFRESH_TOKEN=... \
pnpm --filter task-manager worker

# Fakes only — proves the Worker really consumes `extract-action-items` and returns
# a real BullMQ result, without needing Keychain/Gmail/LM Studio
REDIS_URL=redis://localhost:6379 WORKER_FAKE_DEPS=true pnpm --filter task-manager worker
```

### Evaluating the extraction prompt (`eval/`)

`eval/run.ts` is a local-only eval harness for `src/prompts/extractActionItems.system.md` — a set
of fixture emails (`eval/fixtures.ts`) run through a real local LM Studio server (via the same
`createLmStudioExtractor(...)` the worker uses), each checked against expectations on how many
action items should come back and what they should say. It's for iterating on the prompt by hand:
change the wording, rerun, see which fixtures moved.

It **never runs in CI** — it's outside `vitest`'s `src/**/*.{test,spec}.ts` include glob and outside
`tsc`'s `include` (`src` only), and it needs a real LM Studio server, same reason the real LM Studio
call is excluded from `lmStudio.test.ts`. Run it by hand, with LM Studio running locally and a model
loaded:

```bash
pnpm --filter task-manager eval

# Only fixtures whose name contains this substring
pnpm --filter task-manager eval -- --filter due-date

# Against a non-default LM Studio instance
LM_STUDIO_BASE_URL=http://localhost:1234 pnpm --filter task-manager eval
```

Each fixture asserts on the number of action items returned (exact, or a `{min, max}` range for
cases where the model has legitimate latitude) and, per item, substring/regex checks on
`title`/`description` and whether a `dueDate` is present/absent/an exact value. Assertions are
loose on purpose — the model's wording varies run to run — so failures should point at the
*substance* of an extraction going wrong, not phrasing drift. Local models are non-deterministic,
so a fixture or two flipping between runs is expected; treat it as a trend to watch across a prompt
change, not a hard CI-style gate. Exits non-zero if any fixture had a failing assertion.

Add a fixture whenever `extractActionItems.system.md` gains a new rule, or whenever a real email
turns out to trick it into misclassifying something.

## macOS LaunchAgent (#251)

In normal use the worker isn't run by hand (`pnpm --filter task-manager worker`) — it runs as a
user [LaunchAgent](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
so it starts automatically at login and restarts itself if it crashes. The template plist lives at
[`launchd/com.ertrzyiks.task-manager-worker.plist`](./launchd/com.ertrzyiks.task-manager-worker.plist):

- `RunAtLoad = true` — starts the worker when you log in (or as soon as the agent is loaded).
- `KeepAlive = true` — launchd restarts the worker if it exits for any reason, including a crash
  (subject to launchd's default crash-loop throttling if it keeps failing immediately).
- `ProgramArguments` runs a **standalone executable**, `dist-bin/task-manager-worker` — not
  `node dist/worker.js` and not `pnpm run worker` (the dev-only entrypoint). That binary is
  produced by bundling `worker.ts` with [esbuild](https://esbuild.github.io/) and packaging it
  with [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg), via `pnpm --filter task-manager
  release:worker` ([`scripts/release-worker.mjs`](./scripts/release-worker.mjs)). This exists
  specifically so the Keychain access grant below (`-T`) can be scoped to this one program
  instead of to every script the machine's shared `node` interpreter ever runs — see the PR that
  introduced `release-worker.mjs` for the fuller reasoning.
- No secrets live in this plist. `EnvironmentVariables` isn't set at all — `REDIS_URL`,
  `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and the Gmail refresh token are all read from the
  Keychain at startup (`src/keychain.ts`), provisioned by the release script below.
- LM Studio itself (starting it, keeping a model loaded) is **not** managed by this LaunchAgent —
  that stays your manual responsibility; the worker just calls whatever LM Studio has loaded at
  the time (`src/lmStudio.ts`).

### 1. Create the local secrets file

`scripts/release-worker.mjs` provisions the worker's four Keychain items from a plaintext file
kept **outside this repo checkout** (never gitignored-in-tree — genuinely not in any git working
tree) — the worker itself never reads this file, only the Keychain; it exists purely to feed
`security add-generic-password` on each release.

```bash
mkdir -p ~/.task-manager
cat > ~/.task-manager/secrets.env <<'EOF'
GMAIL_REFRESH_TOKEN=<from scripts/gmail-oauth, see below>
REDIS_URL=<same Redis instance the Jobs API server uses>
GMAIL_CLIENT_ID=<OAuth client id for the gmail.readonly credential, see #236>
GMAIL_CLIENT_SECRET=<OAuth client secret for the same credential>
EOF
chmod 600 ~/.task-manager/secrets.env
```

Get the refresh token first via
[`scripts/gmail-oauth/README.md`](../../scripts/gmail-oauth/README.md) (#247) — it's only ever
shown once, at generation time. Override the file's location with `TASK_MANAGER_SECRETS_FILE` if
you'd rather keep it elsewhere.

### 2. Install the plist (first time only)

Copy the template plist and fill in the one `REPLACE_ME_REPO_PATH` placeholder (see the comments
at the top of the plist). Never commit a copy with a real path filled in; the installed copy lives
outside git:

```bash
cp apps/task-manager/launchd/com.ertrzyiks.task-manager-worker.plist \
  ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
# edit ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist to replace REPLACE_ME_REPO_PATH
```

The binary it points at doesn't exist yet — build it in the next step before loading the agent.

### 3. Build, provision, and (re-)load — one command

```bash
pnpm --filter task-manager release:worker
```

This bundles `worker.ts`, packages it into `dist-bin/task-manager-worker`, ad-hoc code-signs it,
(re-)provisions all four Keychain items trusting that exact binary, and — if the LaunchAgent is
already loaded — restarts it (`launchctl kickstart -k`) to pick up the new build. **Run this again
after every code change or Keychain-value rotation**, not just once: without a paid Apple Developer
ID certificate, the ad-hoc-signed binary's Keychain trust is computed largely from its file hash,
so a rebuild invalidates the previous `-T` grant and the script re-grants it every time. The first
time you run it (before the LaunchAgent is loaded), it builds and provisions everything but skips
the restart — bootstrap the agent once manually:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
# or: launchctl load ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
```

From then on, `pnpm --filter task-manager release:worker` alone handles rebuild + re-provision +
restart.

### 4. Check it's running

```bash
launchctl list | grep com.ertrzyiks.task-manager-worker
```

A PID in the first column means it's running; a non-zero last-exit-status column means it exited
and launchd is about to restart it (`KeepAlive`). Logs go to the `StandardOutPath`/
`StandardErrorPath` files configured in the plist (`launchd/worker.log` /
`launchd/worker-error.log` under your repo checkout by default).

To stop/unload it:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
# or: launchctl unload ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
```

### Offline worker / missed jobs

If the worker isn't running when a job is scheduled (laptop closed, LaunchAgent not loaded yet,
etc.), no special handling is needed: jobs live in BullMQ's Redis-backed queue regardless of
whether a consumer is currently connected, so the worker just picks up any waiting jobs the next
time it starts or reconnects. `KeepAlive` handles the "worker crashed" case; Redis persistence
handles the "worker wasn't running at all" case.

### What's verifiable outside macOS

This repo's CI/sandbox is Linux, so several pieces here have never run for real:

- **Verified in the sandbox**: the esbuild bundle step runs clean against the real dependency
  graph (`bullmq`, `ioredis`, `google-auth-library`, `googleapis`), and `@yao-pkg/pkg` packaging
  was smoke-tested end-to-end against a Linux target — the resulting standalone binary genuinely
  started, connected to a real local Redis, and logged `task-manager worker ready` consuming the
  queue. That confirms the bundling/packaging *mechanics* work.
- **Not verified**: packaging against an actual `macos` target (pkg's prebuilt-binary cache didn't
  have a hit for the exact Node patch version tried here, and cross-compiling isn't possible from
  Linux), `codesign`, `security` (Keychain provisioning), and `launchctl` (LaunchAgent
  bootstrap/reload) — none of those tools exist in this sandbox. Same verification gap as
  `src/keychain.ts`'s real Keychain read always had (see the PR that introduced this file for what
  was and wasn't checked).

## Library loan -> Google Calendar sync

A second sync job, unrelated to Google Tasks above: keeps a Google Calendar event in sync with
every currently-borrowed library book (WBPG, https://katalog.wbpg.org.pl/), so a return date shows
up on the calendar instead of only in the library's own app. Built from a feasibility spike — see
`scripts/wbpg-library-spike/README.md` for how the WBPG API was reverse-engineered (no public docs
exist for it) and what was confirmed against a real account.

Two more `Worker`s started inside `server.ts`, same as `sync-google-tasks` — **not** the Mac
worker, and not a separate Dokku process type. This used to be a standalone entry point
(`librarySyncWorker.ts`) requiring its own `Procfile` process type and a manual `dokku ps:scale`
step; folded into `server.ts` since neither WBPG login (username/password, not OAuth) nor Google
Calendar needs anything Mac-local, matching the one existing precedent (Google Tasks) instead of
being the odd one out. `refresh-library-loans` runs as a BullMQ repeatable job
(`upsertJobScheduler`, cron pattern `LIBRARY_REFRESH_CRON_PATTERN`, see "What is the schedule?"
below); its `Worker` calls `libraryRefresh.ts`, which fans out one `sync-loan-calendar` job per
current loan onto the second queue, consumed by the second `Worker`.

### How it fits together

- `src/library.ts` — the WBPG client (login, walk every linked sub-account via
  `/api/auth/user/subusers` + `/api/auth/user/change`, collect current loans; also resolves branch
  ("filia") id -> name from the public `/api/setting/all`).
- `src/loansStore.ts` — sqlite (`node:sqlite`, no native dependency, unlike `better-sqlite3` —
  matters here because `worker.ts` gets bundled into a standalone binary elsewhere in this
  package). Two tables: the current-loans snapshot, and one row per (filia, return-date day)
  group that's ever gotten a calendar event — see that file's header comment for why the event is
  keyed by *group*, not by individual loan (a prolongation can move a loan into a different
  group, and a per-loan pointer would go stale in a way that's easy to apply to the wrong event).
- `src/googleCalendar.ts` — thin Google Calendar client (create/update/delete/check an event).
- `src/loanCalendarSync.ts` — the actual "sync one loan's event" decision logic, independent of
  BullMQ (mirrors `jobProcessor.ts`'s split) — one book due back at a filia joins whatever event
  already covers that filia+day, creating one if none exists yet; every run recomputes the whole
  group's description so it converges regardless of which loan's job happens to run first, no
  merge step needed even when a prolongation moves a book out of a shared event (see
  `loanCalendarSync.test.ts`'s "prolonged out of a group" test).
- `src/libraryRefresh.ts` — the periodic "check WBPG, replace the loans snapshot, fan out one
  `sync-loan-calendar` job per current loan, garbage-collect calendar events for groups no loan
  belongs to any more" logic (also independent of BullMQ).
- `src/librarySyncQueue.ts` — the two BullMQ queues (`refresh-library-loans`,
  `sync-loan-calendar`), separate from `queue.ts`'s `extract-action-items`.
- `src/libraryConfig.ts` — typed env var loading for the five WBPG/Calendar vars plus their
  optional overrides, called from `server.ts` once all five are confirmed present.

### What is the schedule, and can it be run manually?

`LIBRARY_REFRESH_CRON_PATTERN` (default `0 7 * * *`, daily 07:00 Europe/Warsaw) controls
`refresh-library-loans`'s BullMQ repeatable schedule — that's the only thing that decides when
WBPG gets checked. Yes, it can be run on demand too: open Bull Board (`/admin/queues`, see
"Endpoints" above), find `refresh-library-loans`, and use **Add Job** (any name/data — the worker
processes every job on that queue identically, scheduled or manual). It fans out
`sync-loan-calendar` jobs automatically as part of that run; no need to add those by hand.

### Setup

1. **WBPG credentials**: just your library card number/login and password — set
   `WBPG_USERNAME`/`WBPG_PASSWORD` (see the env var table above).
2. **Google Calendar credential**: run `scripts/calendar-oauth/` — see that folder's README. This
   is a separate refresh token from the existing Gmail one; a Google refresh token is scoped to
   whatever was consented to, and the Gmail one was only ever consented for `gmail.readonly`.
3. **Local dev**: with Redis up (`pnpm --filter task-manager dev:redis`) and `.env` filled in (see
   `.env.example`), just `pnpm --filter task-manager dev` — same command as always, the library
   sync workers start automatically once those five vars are set, same as Google Tasks. This runs
   against the *real* WBPG and Google Calendar — there's no fake-deps mode here (unlike
   `worker.ts`'s `WORKER_FAKE_DEPS`); the pure sync/refresh logic is what `loanCalendarSync.test.ts`
   and `libraryRefresh.test.ts` exist to cover without needing either.
4. **Deploying**: nothing beyond the existing `release_task_manager.yml` — it already builds and
   ships this app's whole `dist/` to the same Dokku app the Jobs API server deploys to, and since
   this runs inside `server.ts` (the app's only process type), no `ps:scale` step is needed.
   `terraform/main.tf`'s `dokku_app.task_manager` needs the six env vars above added to its
   `config` block (sourced from new 1Password items — this repo's convention, see e.g. how
   `GMAIL_REFRESH_TOKEN` is wired for `personal_assistant` in that file) and a `storage` mount at
   `/app/data` (matching `DATABASE_PATH`'s default, same pattern as `kstatus`/`personal_assistant`
   in that file) for the sqlite file to survive redeploys. The terraform change is written; the
   1Password items themselves are a **manual follow-up step**, same division of labor as
   `scripts/gmail-oauth/`'s manual 1Password step for the Mac worker.

### What's verified vs. not

- **Verified**: the WBPG login/cookie/endpoint flow (`scripts/wbpg-library-spike/`, run against a
  real account); `library.ts`'s request/response handling and pagination (`library.test.ts`, via
  an injected fake `fetch`, mirroring `lmStudio.test.ts`); the sqlite store, the per-loan sync
  decision logic (including grouping, rescheduling on a prolonged return date, recovering from an
  event deleted out from under it, and a book leaving a shared event via prolongation), and the
  refresh/fan-out/garbage-collection logic — all fully unit-tested with fakes or a real in-memory
  sqlite db (`loansStore.test.ts`, `loanCalendarSync.test.ts`, `libraryRefresh.test.ts`);
  `tsc`/`vitest`/`pnpm --filter task-manager build` all pass clean with these workers included;
  `server.ts` itself boots against a real local Redis with dummy WBPG/Calendar credentials and
  Bull Board correctly reports both library queues.
- **Not verified**: `googleCalendar.ts`'s actual calls against real Google Calendar infrastructure
  (same situation `gmail.ts`'s `createGmailFetcher` has always been in — nothing to talk to in
  CI/sandbox); the full pipeline end-to-end against a real WBPG account and real Google Calendar
  together; the terraform/1Password wiring above, which references six 1Password items that don't
  exist yet — `terraform plan`/`apply` will fail until they're created by hand (same manual step
  this repo's other integrations have always needed, e.g. `scripts/gmail-oauth/README.md`'s own
  1Password step).
