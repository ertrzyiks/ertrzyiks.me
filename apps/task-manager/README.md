# task-manager

Jobs API server for the email → action-items automation (see [#248](https://github.com/ertrzyiks/ertrzyiks.me/issues/248)).
Exposes the BullMQ + Redis queue over HTTP for `personal-assistant` to schedule action-item
extraction jobs and poll their status/result.

The Mac worker that actually processes jobs (`src/worker.ts`, colocated in this package per #245,
built in #249) consumes the same queue. It never runs on Dokku/CI — it's started locally on the
user's Mac (via a LaunchAgent, see #243) and is the only thing that ever reads email content.

## Environment variables

### Jobs API server (`server.ts` / `devServer.ts`)

| Variable                | Required | Description                                              |
| ------------------------ | -------- | ---------------------------------------------------------- |
| `REDIS_URL`              | yes      | Connection string for the BullMQ-backing Redis instance    |
| `JOBS_API_BEARER_TOKEN`  | yes      | Shared secret every request must present as `Authorization: Bearer <token>` |
| `PORT`                   | no       | HTTP port to listen on (default `3000`)                    |

### Mac worker (`worker.ts`)

| Variable                 | Required | Description                                                                 |
| ------------------------- | -------- | ----------------------------------------------------------------------------- |
| `REDIS_URL`               | yes      | Same Redis instance as the Jobs API server                                    |
| `GMAIL_CLIENT_ID`         | yes\*    | OAuth client id for the worker's `gmail.readonly` credential (#236)           |
| `GMAIL_CLIENT_SECRET`     | yes\*    | OAuth client secret for the same credential                                   |
| `GMAIL_KEYCHAIN_ACCOUNT`  | no       | macOS Keychain "account" to read the refresh token from (default `task-manager-worker`) |
| `GMAIL_KEYCHAIN_SERVICE`  | no       | macOS Keychain "service" to read the refresh token from (default `gmail-refresh-token`) |
| `LM_STUDIO_BASE_URL`      | no       | Base URL of the local LM Studio server (default `http://localhost:1234`)      |
| `WORKER_FAKE_DEPS`        | no       | `"true"` swaps in canned fake Gmail/LM Studio implementations instead of the real ones — **manual smoke-testing only, never set in production** (see below) |

\* not required when `WORKER_FAKE_DEPS=true`.

The worker reads the Gmail refresh token from the **macOS Keychain** at startup by shelling out to
the `security` CLI (`security find-generic-password -a <account> -s <service> -w`, see
`src/keychain.ts`). **This is macOS-only** — there is no cross-platform Node API for the Keychain —
and it has never been exercised against a real Keychain in this repo's CI or in the sandbox this
worker was developed in, both of which are Linux. Likewise, the LM Studio HTTP call
(`src/lmStudio.ts`) talks to a real local server that isn't running in CI/sandbox either. Both are
built behind small seams (`EmailFetcher`, `ActionItemExtractor`) so `src/jobProcessor.ts` — the
actual "handle one job" logic — is unit-tested with fakes, independent of Keychain/Gmail/LM Studio
availability. See the PR that introduced this file for what was and wasn't verified end-to-end.

## Endpoints

All endpoints require `Authorization: Bearer <JOBS_API_BEARER_TOKEN>`.

- `POST /jobs` — `{ emailId }` → `201 { jobId }`
- `GET /jobs/:jobId` — `200 { jobId, status, result?, error? }`, `404` if unknown
- `POST /jobs/status` — `{ jobIds: [...] }` → `200 { results: [{ jobId, status, result?, error? }, ...] }` (unknown job IDs are omitted from `results`)

`status` is one of `pending | active | completed | failed`, collapsing BullMQ's internal states
per the contract in #241.

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

   This runs `src/devServer.ts` instead of the production `src/server.ts` entrypoint. It loads
   `apps/task-manager/.env` (via `dotenv`) and additionally mounts the
   [Bull Board](https://github.com/felixmosh/bull-board) queue-inspection UI, which the
   production server never does — `server.ts` (what Dokku actually runs via `pnpm start`) has no
   dependency on `dotenv` or `@bull-board/*` at all.

4. Open the queue UI at **http://localhost:3000/admin/queues** (send the same
   `Authorization: Bearer <JOBS_API_BEARER_TOKEN>` header/cookie the API expects — the auth hook
   in `app.ts` guards every route, Bull Board included). Post a job and watch it show up:

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
Gmail/LM Studio (macOS only) or, for smoke-testing the queue wiring itself anywhere (including this
sandbox), against fakes:

```bash
# Real Gmail + LM Studio (macOS only — reads the refresh token from the Keychain)
REDIS_URL=redis://localhost:6379 \
GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... \
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
- `ProgramArguments` runs the **built** `dist/worker.js` via `node` directly — not
  `pnpm run worker` (that runs `tsx watch src/worker.ts`, the dev-only entrypoint) — matching how
  the Jobs API server's `start` script runs `dist/server.js` rather than a dev script.
- LM Studio itself (starting it, keeping a model loaded) is **not** managed by this LaunchAgent —
  that stays your manual responsibility; the worker just calls whatever LM Studio has loaded at
  the time (`src/lmStudio.ts`).

### 1. Store the Gmail refresh token in the Keychain

The worker reads the refresh token from the Keychain at startup (`src/keychain.ts`) instead of a
plaintext file or env var. Get the refresh token first (see
[`scripts/gmail-oauth/README.md`](../../scripts/gmail-oauth/README.md), #247), then store it under
the exact account/service `keychain.ts` reads by default (`GMAIL_KEYCHAIN_ACCOUNT` /
`GMAIL_KEYCHAIN_SERVICE`, default `task-manager-worker` / `gmail-refresh-token`):

```bash
security add-generic-password \
  -a "task-manager-worker" \
  -s "gmail-refresh-token" \
  -w "<the refresh token>"
```

If you'd rather use a different account/service, set `GMAIL_KEYCHAIN_ACCOUNT`/
`GMAIL_KEYCHAIN_SERVICE` in the plist's `EnvironmentVariables` to match whatever you stored it
under.

### 2. Build the worker and install the plist

```bash
pnpm --filter task-manager build   # produces apps/task-manager/dist/worker.js
```

Copy the template plist and fill in every `REPLACE_ME_*` placeholder (absolute path to `node`,
absolute path to this repo checkout, `REDIS_URL`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`) —
see the comments at the top of the plist for exactly what each one needs and where it comes from.
Never commit a copy with real values filled in; the installed copy lives outside git:

```bash
cp apps/task-manager/launchd/com.ertrzyiks.task-manager-worker.plist \
  ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
# edit ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist to replace the placeholders
```

Load it (modern `launchctl bootstrap`, or the older `load` if your macOS version prefers it):

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
# or: launchctl load ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
```

### 3. Check it's running

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

This plist was developed and reviewed in a Linux sandbox, where `launchd`/`launchctl` don't exist,
so it has never actually been loaded or run for real — same verification gap as `src/keychain.ts`'s
real Keychain read (see the PR that introduced this file for what was and wasn't checked).
