# task-manager

Jobs API server for the email → action-items automation (see [#248](https://github.com/ertrzyiks/ertrzyiks.me/issues/248)).
Exposes the BullMQ + Redis queue over HTTP for `personal-assistant` to schedule action-item
extraction jobs and poll their status/result.

The Mac worker that actually processes jobs (`src/worker.ts`, colocated in this package per #245,
built in #249) consumes the same queue. It never runs on Dokku/CI — it's started locally on the
user's Mac (via a LaunchAgent, see #243) and is the only thing that ever reads email content.

A second queue, `sync-google-tasks`, keeps `personal-assistant`'s `action_items` table in sync
with Google Tasks — unlike `extract-action-items`, its worker runs right here in `server.ts`
(cloud), since pushing an already-extracted action item has none of the "must never leave local
processing" constraints that keep the Mac worker on the Mac. See "Google Tasks sync" below.

## Environment variables

### Jobs API server (`server.ts`)

| Variable                                        | Required | Description                                              |
| ------------------------------------------------ | -------- | ---------------------------------------------------------- |
| `REDIS_URL`                                       | yes      | Connection string for the BullMQ-backing Redis instance    |
| `JOBS_API_BEARER_TOKEN`                           | yes      | Shared secret every request must present as `Authorization: Bearer <token>` |
| `PORT`                                            | no       | HTTP port to listen on (default `3000`)                    |
| `TASK_MANAGER_BULL_BOARD_BASIC_AUTH_USERNAME`     | no\*     | Basic Auth username guarding the Bull Board UI (`/admin/queues`) |
| `TASK_MANAGER_BULL_BOARD_BASIC_AUTH_PASSWORD`     | no\*     | Basic Auth password guarding the Bull Board UI              |
| `GOOGLE_TASKS_CLIENT_ID`                          | no\*\*   | OAuth client id for the `sync-google-tasks` worker's `tasks` credential |
| `GOOGLE_TASKS_CLIENT_SECRET`                      | no\*\*   | OAuth client secret for the same credential                 |
| `GOOGLE_TASKS_REFRESH_TOKEN`                      | no\*\*   | Refresh token for the same credential (from `scripts/google-tasks-oauth`) |
| `GOOGLE_TASKS_LIST_ID`                            | no       | Google Tasks list to create tasks in (default `@default`, the user's default list) |
| `GOOGLE_TASKS_RATE_LIMIT_MAX`                     | no       | Max `sync-google-tasks` jobs processed per `GOOGLE_TASKS_RATE_LIMIT_DURATION_MS` window (default `5`) |
| `GOOGLE_TASKS_RATE_LIMIT_DURATION_MS`             | no       | Window length in ms for the rate limit above (default `1000`)|

\* Bull Board is always mounted, but the Basic Auth check only applies when **both** vars are set —
unset (the default locally) leaves it open. Production always sets both via Terraform (#313).

\*\* The `sync-google-tasks` worker (started inside this same process, see below) only starts
once all three are set. Unset — the state before `scripts/google-tasks-oauth` has been run once —
the Jobs API still accepts `/google-tasks-jobs` requests, they just queue up unconsumed until the
worker starts.

## Google Tasks sync

`POST /google-tasks-jobs` schedules a job on the `sync-google-tasks` queue, consumed by a second
`bullmq.Worker` started alongside the Jobs API server in `server.ts` (`src/googleTasksJobProcessor.ts`
→ `src/googleTasksClient.ts`, wrapping the Google Tasks API). `personal-assistant`'s sync loop
(`src/googleTasksSyncer.ts`) is the only caller: it schedules a job for each action item without
a `job_id` yet, then polls for completion and backfills `task_id` — see that package's README for
the full loop.

This worker's credential is separate from the Mac worker's `gmail.readonly` one — provisioned via
`scripts/google-tasks-oauth`, read from plain env vars (not the macOS Keychain, since this worker
runs in the cloud) via Terraform/1Password in production.

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
| `GMAIL_CLIENT_ID`         | no\*     | OAuth client id for the worker's `gmail.readonly` credential (#236)           |
| `GMAIL_CLIENT_SECRET`     | no\*     | OAuth client secret for the same credential                                   |
| `GMAIL_REFRESH_TOKEN`     | no\*     | Refresh token for the same credential (from `scripts/gmail-oauth`)            |
| `GMAIL_KEYCHAIN_SERVICE`  | no       | macOS Keychain "service" all four secrets above are read from (default `task-manager-worker`) |
| `GMAIL_KEYCHAIN_ACCOUNT`  | no       | macOS Keychain "account" the refresh token specifically is read from (default `gmail-refresh-token`) |
| `LM_STUDIO_BASE_URL`      | no       | Base URL of the local LM Studio server (default `http://localhost:1234`)      |
| `WORKER_FAKE_DEPS`        | no       | `"true"` swaps in canned fake Gmail/LM Studio implementations instead of the real ones — **manual smoke-testing only, never set in production** (see below) |

\* All four secrets are read from the macOS Keychain if not set as env vars (see `resolveSecret`
in `src/keychain.ts`) — the production LaunchAgent sets none of them and relies entirely on the
Keychain. Setting them as env vars is a **local dev/CI convenience only** (this repo's Linux
sandbox has no Keychain to fall back to); never set them in the LaunchAgent plist, which would put
them back in plaintext. This includes `GMAIL_REFRESH_TOKEN` — the most sensitive of the four — so
only set it locally when you actually need to exercise a real Gmail credential outside the
Keychain; `WORKER_FAKE_DEPS=true` is the lower-stakes option when you just need to prove the queue
wiring works.

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
