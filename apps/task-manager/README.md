# task-manager

Jobs API server for the email → action-items automation (see [#248](https://github.com/ertrzyiks/ertrzyiks.me/issues/248)).
Exposes the BullMQ + Redis queue over HTTP for `personal-assistant` to schedule action-item
extraction jobs and poll their status/result.

Every queue this package owns — including `extract-action-items`, the one that actually reads
email content — runs as a `bullmq.Worker` started directly inside `server.ts`, one Dokku process
type, no separate machine required:

- `extract-action-items` fetches an email via Gmail and calls
  [OpenRouter](https://openrouter.ai) to extract action items and calendar events from it. See
  "Email action-item extraction" below.
- `sync-todoist` keeps `personal-assistant`'s `action_items` table in sync with Todoist.
  See "Todoist sync" below.
- `sync-calendar-events` keeps `personal-assistant`'s `calendar_events` table in sync with Google
  Calendar — the calendar-event counterpart to `sync-todoist`, for events extracted alongside
  action items (see `extract-action-items`'s `CalendarEvent` type). See "Calendar event sync"
  below.
- `sync-loan-calendar` (plus `refresh-library-loans`, which feeds it) keeps a Google Calendar
  event in sync with every currently-borrowed library book's return date. See "Library loan ->
  Google Calendar sync" below.

`extract-action-items` used to be the one exception: a Mac-only worker (`src/worker.ts`, #245/
#249/#251, removed) that ran via a LaunchAgent because it called a local LM Studio server, and so
required a Mac to be up and email content to never leave it. Once extraction moved to OpenRouter
— a cloud API regardless of what dispatches the request — that constraint no longer applied, so
this queue folded into `server.ts` like every other one. **This is a real trade-off, not a free
lunch**: email content (and whatever action items/events get derived from it) is now sent to
OpenRouter and — since no `OPENROUTER_MODEL` is required — whichever provider happens to serve the
free model auto-picked from OpenRouter's catalog at the time (see "Email action-item extraction"
below), same as `personal-assistant`'s own Gmail credential only ever having handled message *ids*
before. See
"Email action-item extraction" below for the env vars, and `openRouter.ts`'s header comment for
more on the trade-off. If you previously had the old Mac LaunchAgent installed, see "Decommissioning
the old Mac worker" at the end of this file.

## Module and queue layout

`src/modules/<module-name>/` is the top-level grouping — one per business capability this package
owns, not per queue:

- `src/modules/email-processing/` — one queue, `extract-action-items` (see "Email action-item
  extraction" below).
- `src/modules/todoist/` — one queue, `sync-todoist`.
- `src/modules/google-calendar/` — one queue, `sync-calendar-events`.
- `src/modules/loans/` — two queues, `refresh-library-loans` and `sync-loan-calendar` (see
  "Library loan -> Google Calendar sync" below for how the two relate).

Under each module, `queues/<queue-name>/` holds everything that belongs to that one queue and
nothing else:

- `queue.ts` — the queue name constant and a `createQueue(redisUrl)` factory returning a
  configured BullMQ `Queue` (shared `defaultJobOptions` retry policy, see `retry.ts`). Also holds
  any small producer-side type this queue's jobs need (e.g. the `JobsQueue` lookup interface
  `app.ts` depends on for `extract-action-items`, or `sync-loan-calendar`'s `LoanSyncQueue`
  fan-out adapter that `libraryRefresh.ts` enqueues through).
- `worker.ts` — a `createWorker(connection, deps)` factory returning a configured BullMQ `Worker`:
  the job-processor callback plus its `ready`/`failed` listeners (Sentry reporting included).
- The actual "handle one job" logic (`jobProcessor.ts`, `todoistJobProcessor.ts`,
  `calendarEventJobProcessor.ts`, `libraryRefresh.ts`, `loanCalendarSync.ts`) and everything only
  *it* depends on (Gmail/OpenRouter for `extract-action-items`, the Todoist client
  for `sync-todoist`, the WBPG client for `refresh-library-loans`) — kept independent of
  BullMQ so it can be unit-tested with fakes; `worker.ts` is only the wiring around it.

A file lives at a queue's `queues/<queue-name>/` level only if that queue is its *only* consumer;
one level up, directly under the module (e.g. `src/modules/loans/loansStore.ts`,
`.../libraryConfig.ts`), if more than one queue *in that module* shares it (both `loans` queues
read/write the loans sqlite store, so that stays at the module level rather than picking one
queue's folder to live under); and at `src/` top level only if it's shared across *modules*
(`axiomEvents.ts`, `jobLogger.ts`, `sentry.ts`, `retry.ts`, `jobStatus.ts`, `auth.ts`,
`bullBoard.ts`, `workerLogger.ts`, `googleCalendarClient.ts` — the last one moved here from
`modules/loans/` once `sync-calendar-events` needed the same Google Calendar client the library
sync already had) or is a process entrypoint spanning more than one module (`app.ts`, `server.ts`).

`server.ts` just imports `createQueue`/`createWorker` from these modules and wires in their own
dependencies/logger (Fastify's `app.log` in every case now) rather than constructing
`Queue`/`Worker` inline.

## Environment variables

### Jobs API server (`server.ts`)

| Variable                                        | Required | Description                                              |
| ------------------------------------------------ | -------- | ---------------------------------------------------------- |
| `REDIS_URL`                                       | yes      | Connection string for the BullMQ-backing Redis instance    |
| `JOBS_API_BEARER_TOKEN`                           | yes      | Shared secret every request must present as `Authorization: Bearer <token>` |
| `PORT`                                            | no       | HTTP port to listen on (default `3000`)                    |
| `TASK_MANAGER_BULL_BOARD_BASIC_AUTH_USERNAME`     | no\*     | Basic Auth username guarding the Bull Board UI (`/admin/queues`) |
| `TASK_MANAGER_BULL_BOARD_BASIC_AUTH_PASSWORD`     | no\*     | Basic Auth password guarding the Bull Board UI              |
| `GMAIL_CLIENT_ID`                                 | no\*\*\*\*\*\* | OAuth client id for the `extract-action-items` worker's `gmail.readonly` credential (#236; shared across gmail/tasks/calendar, #343) |
| `GMAIL_CLIENT_SECRET`                             | no\*\*\*\*\*\* | OAuth client secret for the same credential                                   |
| `GMAIL_REFRESH_TOKEN`                             | no\*\*\*\*\*\* | Refresh token for the same credential (from `scripts/gmail-oauth`)            |
| `OPENROUTER_API_KEY`                              | no\*\*\*\*\*\* | API key from https://openrouter.ai/keys — see "Email action-item extraction" below for the trade-off of sending email content there |
| `OPENROUTER_MODEL`                                | no       | Pins a specific OpenRouter model to call — unset (the default), one is auto-picked from OpenRouter's live free catalog on worker startup (see `pickFreeModel` in `openRouterClient.ts`) |
| `OPENROUTER_BASE_URL`                             | no       | Overrides OpenRouter's own base URL (default `https://openrouter.ai/api/v1`) — no reason to set this outside testing against a compatible proxy |
| `EXTRACT_ACTION_ITEMS_RATE_LIMIT_MAX`             | no       | Max `extract-action-items` jobs processed per `EXTRACT_ACTION_ITEMS_RATE_LIMIT_DURATION_MS` window (default `5`) — free OpenRouter models enforce their own (often low) requests-per-minute ceiling |
| `EXTRACT_ACTION_ITEMS_RATE_LIMIT_DURATION_MS`     | no       | Window length in ms for the rate limit above (default `60000`) |
| `WORKER_INSPECTION_DIR`                           | no       | Directory to write one JSON file per `extract-action-items` run (email content + extracted action items/events, or the error) to — default `./audit`; set to `""` to disable entirely (see "Inspection log" below) |
| `TODOIST_API_TOKEN`                               | no\*\*   | Personal API token for the `sync-todoist` worker (Settings > Integrations > Developer in the Todoist app — no OAuth dance needed) |
| `TODOIST_PROJECT_ID`                              | no       | Todoist project to create tasks in (default: the user's Inbox) |
| `TODOIST_RATE_LIMIT_MAX`                          | no       | Max `sync-todoist` jobs processed per `TODOIST_RATE_LIMIT_DURATION_MS` window (default `5`) |
| `TODOIST_RATE_LIMIT_DURATION_MS`                  | no       | Window length in ms for the rate limit above (default `1000`)|
| `GOOGLE_CALENDAR_CLIENT_ID`                       | no\*\*\* | OAuth client id for the `calendar.events` credential (shared across gmail/tasks/calendar, #343) |
| `GOOGLE_CALENDAR_CLIENT_SECRET`                   | no\*\*\* | OAuth client secret for the same credential                                   |
| `GOOGLE_CALENDAR_REFRESH_TOKEN`                   | no\*\*\* | Refresh token for the same credential                                         |
| `GOOGLE_CALENDAR_ID`                              | no       | Which calendar to write to (default `primary`, i.e. the refresh token's own account's main calendar) — shared by `sync-calendar-events` and the library sync below |
| `GOOGLE_CALENDAR_TIMEZONE`                        | no       | IANA zone events are created in (default `Europe/Warsaw`) — shared by `sync-calendar-events` and the library sync below |
| `CALENDAR_EVENTS_RATE_LIMIT_MAX`                  | no       | Max `sync-calendar-events` jobs processed per `CALENDAR_EVENTS_RATE_LIMIT_DURATION_MS` window (default `5`) |
| `CALENDAR_EVENTS_RATE_LIMIT_DURATION_MS`          | no       | Window length in ms for the rate limit above (default `1000`)|
| `WBPG_USERNAME`                                   | no\*\*\*\* | WBPG library card number / login, for the library sync workers                |
| `WBPG_PASSWORD`                                   | no\*\*\*\* | WBPG password                                                                 |
| `DATABASE_PATH`                                   | no       | Where the sqlite loans DB lives (default `/app/data/library.sqlite`, matching the Dokku storage mount — see terraform/main.tf) |
| `WBPG_BASE_URL`                                   | no       | Overrides the WBPG catalog base URL (default `https://katalog.wbpg.org.pl`)   |
| `LIBRARY_REFRESH_CRON_PATTERN`                    | no       | Cron pattern for how often to re-check WBPG (default `0 7 * * *`, daily 07:00 Europe/Warsaw) |
| `AXIOM_TOKEN`                                     | no       | Axiom API token for trend-event ingestion (#315), used by every worker started in this process |
| `AXIOM_DATASET`                                   | no       | Axiom dataset to ingest into (e.g. `task-manager-events`)                     |
| `SENTRY_DSN`                                      | no       | Sentry DSN for error monitoring (see "Error monitoring" below)                |
| `SENTRY_ENVIRONMENT`                              | no       | Overrides the `environment` tag Sentry events are reported under (default `production`) |

\* Bull Board is always mounted, but the Basic Auth check only applies when **both** vars are set —
unset (the default locally) leaves it open. Production always sets both via Terraform (#313).

\*\* The `sync-todoist` worker (started inside this same process, see below) only starts once
`TODOIST_API_TOKEN` is set. Unset, the Jobs API still accepts `/todoist-jobs` requests, they just
queue up unconsumed until the worker starts.

\*\*\* The `sync-calendar-events` worker only starts once all three are set — same
optional-at-startup pattern as `TODOIST_API_TOKEN` above, and independent of the WBPG vars
below: an install with no library sync configured at all still gets email-derived calendar events.
Unset, the Jobs API still accepts `/calendar-event-jobs` requests, they just queue up unconsumed
until the worker starts. The `refresh-library-loans`/`sync-loan-calendar` workers *also* need these
three (see the next footnote) — when both features are configured, each starts its own
`createGoogleCalendarClient` against the same credential rather than sharing one instance, which is
harmless (both just talk to the same Calendar API).

\*\*\*\* The `refresh-library-loans`/`sync-loan-calendar` workers (also started inside this same
process) only start once these two **and** the three `GOOGLE_CALENDAR_*` vars above are all set —
same optional-at-startup pattern as `TODOIST_API_TOKEN` above. Unset, Bull Board still shows both
queues (registered unconditionally so its "Add Job" button always works — see `bullBoard.ts`),
jobs just queue up unconsumed until the workers start.

\*\*\*\*\*\* The `extract-action-items` worker only starts once all four (`GMAIL_CLIENT_ID`/
`_SECRET`/`_REFRESH_TOKEN` and `OPENROUTER_API_KEY`) are set — same optional-at-startup pattern as
`TODOIST_API_TOKEN` above. Unset, the Jobs API still accepts `POST /jobs` requests, they just queue
up unconsumed until the worker starts. See "Email action-item extraction" below.

`AXIOM_TOKEN`/`AXIOM_DATASET` are independent of each other and of everything above — see
"Historical/trend observability" below.

## Todoist sync

`POST /todoist-jobs` schedules a job on the `sync-todoist` queue, consumed by a second
`bullmq.Worker` started alongside the Jobs API server in `server.ts`
(`src/modules/todoist/queues/sync-todoist/todoistJobProcessor.ts` →
`src/modules/todoist/queues/sync-todoist/todoistClient.ts`, wrapping Todoist's REST API).
`personal-assistant`'s sync loop
(`src/todoistSyncer.ts`) is the only caller: it schedules a job for each action item without
a `job_id` yet, then polls for completion and backfills `task_id` — see that package's README for
the full loop.

Unlike the Google Tasks integration this replaced, there's no OAuth dance: `TODOIST_API_TOKEN` is
a personal API token, generated once from Todoist's own Settings > Integrations > Developer page
and set directly as a plain env var (via Terraform/1Password in production, see
`task_manager_todoist_api_token`). `TODOIST_PROJECT_ID` picks which project new tasks land in
(defaults to the Inbox); production points it at a specific project rather than the Inbox.

The worker's `Worker` is configured with a `limiter` (`TODOIST_RATE_LIMIT_MAX`/`_DURATION_MS`
above) so a burst of scheduled jobs drains onto Todoist's API gradually instead of all at once —
kept as a precaution, mirroring the Google Tasks worker's limiter this replaced (it hit a real
"quota exceeded" error from a burst of jobs; Todoist's own rate limits haven't been hit in
practice yet). A `due` date with no enforced format (the extracted action item's `dueDate` — see
`openRouter.ts`) doesn't need any special handling here: `todoistClient.ts` passes it straight
through as Todoist's `due_string` field, which runs it through Todoist's own natural-language due
parser instead of requiring a strict format.

## Calendar event sync

The calendar-event counterpart to Todoist sync above — same shape, different destination.
`POST /calendar-event-jobs` schedules a job on the `sync-calendar-events` queue, consumed by a
third `bullmq.Worker` started alongside the Jobs API server in `server.ts`
(`src/modules/google-calendar/queues/sync-calendar-events/calendarEventJobProcessor.ts` →
`src/googleCalendarClient.ts`, wrapping the Google Calendar API — the same client the library-loan
sync below uses). `personal-assistant`'s sync loop (`src/calendarEventSyncer.ts`) is the only
caller: it schedules a job for each calendar event without a `job_id` yet, then polls for
completion and backfills `google_event_id` — see that package's README for the full loop, and
`extract-action-items`'s `CalendarEvent` type (`actionItem.ts`) for where the events themselves
come from.

This worker reads the same `GOOGLE_CALENDAR_CLIENT_ID`/`_SECRET`/`_REFRESH_TOKEN` credential as the
library-loan sync (see "Library loan -> Google Calendar sync" below) and the same
`GOOGLE_CALENDAR_ID`/`_TIMEZONE` target, but starts independently of it — see the env var table's
footnotes above. Since a `CalendarEvent`'s `startTime` is required but `endTime` is optional (see
`extractActionItems.system.md`'s Phase 3), `calendarEventJobProcessor.ts` gives an event with no
stated end time a flat one-hour default duration rather than creating a zero-length event — Google
Calendar's API requires a real `end`. Same `limiter` treatment as Todoist above
(`CALENDAR_EVENTS_RATE_LIMIT_MAX`/`_DURATION_MS`), tuned separately since the two APIs have
separate quotas.

## Email action-item extraction

`POST /jobs` schedules a job on the `extract-action-items` queue, consumed by a `bullmq.Worker`
started alongside the Jobs API server in `server.ts`
(`src/modules/email-processing/queues/extract-action-items/jobProcessor.ts` → `gmail.ts` to fetch
the email, then `openRouter.ts` to extract action items and calendar events from it). See the env
var table above for `GMAIL_CLIENT_ID`/`_SECRET`/`_REFRESH_TOKEN` and `OPENROUTER_API_KEY`/`_MODEL`/
`_BASE_URL`; the worker only starts once all four required ones are set (footnote \*\*\*\*\*\*
above), same optional-at-startup pattern as `sync-todoist`/`sync-calendar-events`.

**This queue used to be a Mac-only exception.** Until #370-era work moved extraction onto
OpenRouter, it called a local LM Studio server, so this was a separate LaunchAgent-run worker
(`src/worker.ts`, #245/#249/#251) that read the Gmail refresh token from the macOS Keychain and
never ran on Dokku — the only thing in this whole system that ever saw raw email content, and it
never left the machine it ran on. That constraint is gone now: OpenRouter is a cloud API regardless
of what calls it, so this queue's `Worker` runs in the same process as everything else, and email
content is sent off-machine to OpenRouter to be read and processed. `GMAIL_CLIENT_ID`/`_SECRET`/
`_REFRESH_TOKEN` are now plain env vars like every other credential in this file — no Keychain, no
LaunchAgent, no Mac-specific code path left in this queue at all.

**No model id to keep up to date by hand.** Leave `OPENROUTER_MODEL` unset (the default) and
`openRouter.ts` picks a model itself the first time the worker extracts something, via
`pickFreeModel` in `openRouterClient.ts`: it fetches OpenRouter's live catalog (`GET /models`),
keeps only free (`pricing.prompt`/`.completion` both `0`), text-output models, prefers ones that
declare strict JSON-schema support (`supported_parameters` includes `structured_outputs` — what
`requestStructuredCompletion`'s `response_format.json_schema.strict: true` actually needs), and
among those picks the largest context length (a rough capability proxy, since an email can be
long). That choice is cached for the life of the worker process rather than re-fetched per job — a
catalog lookup on every job would compete against this worker's own tight
`EXTRACT_ACTION_ITEMS_RATE_LIMIT_MAX`/`_DURATION_MS` budget for no benefit — but a failed
completion clears the cache so the *next* job re-picks instead of retrying the same broken choice
for the rest of the process's life (e.g. if OpenRouter retired or repriced it). The trade-off: you
don't know in advance exactly which model/provider will end up reading your email, and it can
change across worker restarts as OpenRouter's free lineup rotates. Set `OPENROUTER_MODEL` (see
https://openrouter.ai/models?max_price=0 for the current free lineup to choose from) if you'd
rather pin a specific one and know for certain.

Not every model honors `response_format`'s `json_schema` mode equally strictly, pinned or
auto-picked — a malformed or rejected request surfaces as a normal job failure, retried per
`queue.ts`'s backoff policy, same as any other extraction error (see `openRouterClient.ts`'s header
comment). OpenRouter's free models also enforce their own (often quite low) requests-per-minute
ceiling regardless of which one gets picked — see `EXTRACT_ACTION_ITEMS_RATE_LIMIT_MAX`/
`_DURATION_MS` in the env var table above.

`gmail.ts`'s Gmail API calls and `openRouter.ts`'s OpenRouter calls both talk to real external
services this repo's CI/sandbox can't reach, so both are built behind small seams (`EmailFetcher`,
`ActionItemExtractor`) and covered by fakes — `jobProcessor.test.ts` for the "handle one job" logic
end to end, `openRouterClient.test.ts` for `pickFreeModel`'s filtering/sorting against fixture
catalog entries, `openRouter.test.ts` for the completion request/response shape and the two files
wired together (including the discovery-caching/re-pick-on-failure behavior above) against a fake
`fetch`. See "Evaluating the extraction prompt" below for exercising the *real* OpenRouter call by
hand.

## Historical/trend observability (#315)

Bull Board (above) is a **live/snapshot** view — current queue state, right now, plus retry/
inspect. It deliberately doesn't show trends over time (a failure spike an hour ago, a stalled
queue overnight). That's what [Axiom](https://axiom.co) is for: `src/axiomEvents.ts`
fire-and-forget POSTs a `{ service: "task-manager", entity, entityId, status, _time, error? }`
event to Axiom's ingest API at each job's `active`/`completed`/`failed` transition — emitted
inline in `jobProcessor.ts` (`entity: "extract-action-items"`, `entityId` = the email id),
`todoistJobProcessor.ts` (`entity: "sync-todoist"`, `entityId` = the action item id), and
`calendarEventJobProcessor.ts` (`entity: "sync-calendar-events"`, `entityId` = the calendar event
id), right where each transition already happens, rather than a separate BullMQ `QueueEvents`
Redis-pubsub listener — simpler, no new listener lifecycle to manage.

Fully best-effort: `emit()` never throws or awaits into the job pipeline it's describing (fire the
request, log-and-swallow any failure via `console.error` — this package has no logger abstraction
today) — a dropped event from a brief Axiom outage is an acceptable gap in a 30-day trends view,
not a job failure. A no-op (`noopEventEmitter`) until both `AXIOM_TOKEN`/`AXIOM_DATASET` are set
(see the env var table above) — this is purely additive. Every worker in this process shares the
same `task-manager-events` Axiom dataset (`personal-assistant` has its own separate one,
`personal-assistant-events` — see that package's README); the `entity` field is what distinguishes
`extract-action-items`, `sync-todoist`, and `sync-calendar-events` jobs within it.

## Error monitoring (Sentry)

Axiom above answers "how many jobs failed, and when" — a trend, not a stack trace. `src/sentry.ts`
wires up [Sentry](https://sentry.io) to answer the complementary question, "what broke and why":
`initSentry()` is called once at the top of `server.ts`, this package's one entrypoint — one
Sentry project covers this whole package, the same way one Bull Board/one set of tests does.

Wired at process/queue boundaries, not into every internal try/catch:

- The global uncaught-exception/unhandled-rejection handlers — installed automatically by
  `Sentry.init` itself, no extra code here.
- Every `bullmq.Worker`'s `"failed"` event (`extract-action-items`, `sync-todoist`,
  `sync-calendar-events`, and the two library sync queues) — alongside the `app.log.error` call
  already there, `Sentry.captureException(error, { tags: { queue, jobId } })`.
- The Fastify app: `Sentry.setupFastifyErrorHandler(app)` (in `app.ts`) reports any route handler
  exception that reaches Fastify's own error handling — every route already returns its own
  400/401/404 explicitly rather than throwing, so this only ever fires on a genuine bug.
- `server.ts`'s own startup-failure catch block around `app.listen()`.

Deliberately *not* duplicated into `jobProcessor.ts`/`todoistJobProcessor.ts`/
`calendarEventJobProcessor.ts`'s own catch blocks — those already rethrow into the `Worker` that's
running them, so the `"failed"` handlers
above already see the same error once, not once per internal failure site. This keeps one Sentry
event per job failure rather than multiplying against Sentry's free-tier event quota.

Same no-op-until-configured treatment as Axiom: `Sentry.init`/`Sentry.captureException` are safe
no-ops with no `SENTRY_DSN` set (see `sentry.ts`'s header comment) — this is purely additive.

## Inspection log

Axiom and Sentry above answer "did the job succeed" and "what broke" — neither shows *what the LLM
actually saw and produced*, which is what you need when judging extraction quality or debugging a
bad set of action items/events. `src/modules/email-processing/queues/extract-action-items/inspectionLog.ts` writes one JSON file per `extract-action-items` run
to `WORKER_INSPECTION_DIR` (see the env var table above; default `./audit`, resolved
against the process's cwd — the repo checkout in dev, ephemeral container storage in a real Dokku
deploy) — `{ emailId, email, actionItems, events }` on success, `{ emailId, email, error }` if
extraction failed (fetch failures aren't logged here, there's no email content yet to inspect). One
file per run rather than one per `emailId` on purpose: re-running/regenerating action items for the
same email appends another file instead of overwriting the last one, so every attempt stays
available for comparison. Set `WORKER_INSPECTION_DIR=""` to turn this off entirely — see
`createFileInspectionLogger`'s no-op sibling, `noopInspectionLogger`. `./audit` is gitignored
(unlike `AXIOM_TOKEN`/`SENTRY_DSN`, this one really is on by default — it's real email content, so
it must never end up committed).

### Reviewing extractions (`npm run review`)

`scripts/review-inspections.ts` is a small local Fastify server + single-page UI
(`http://127.0.0.1:4600` by default) for browsing the inspection log above and flagging wrong
extractions. With no flags/env vars it reads from the same `./audit` default the worker itself
writes to:

```bash
npm run review
# or, matching a non-default WORKER_INSPECTION_DIR:
npm run review -- --dir ./audit --port 4600
```

It lists every run newest-first (subject/from, collapsible body, extracted action items and events,
or the error). Clicking "This is wrong…" on a run opens a form to describe what the extraction
*should* have produced (action items only — flagging doesn't cover events yet) — the same loose
`{ count, items: [{ titleContains, descriptionContains, dueDate }] }`
shape `eval/fixtures.ts`'s hand-picked fixtures use (see that file's `ItemExpectation`). Saving
writes a fixture to `eval/reviewed-fixtures.json` (read/exported by `eval/reviewedFixtures.ts`),
which `eval/reviewedFixtures.eval.test.ts` runs the real extractor against, same eval harness as
`extractActionItems.eval.test.ts` (both now share `eval/runFixtureSuite.ts`).

A freshly-flagged fixture is *expected* to fail (red) — that's the point, it's a checklist entry
recording a real mistake, not a regression guard. Run `npm run eval` after flagging a few to see
them fail, use them as a worklist while iterating on `src/modules/email-processing/queues/extract-action-items/prompts/extractActionItems.system.md`,
and re-run until they go green. "Unflag" in the UI (or deleting the entry from
`eval/reviewed-fixtures.json` by hand) removes a fixture if it was flagged by mistake.

## Endpoints

All `/jobs*`, `/todoist-jobs*`, and `/calendar-event-jobs*` endpoints require
`Authorization: Bearer <JOBS_API_BEARER_TOKEN>`.

- `POST /jobs` — `{ emailId }` → `201 { jobId }`
- `GET /jobs/:jobId` — `200 { jobId, status, result?, error? }`, `404` if unknown
- `POST /jobs/status` — `{ jobIds: [...] }` → `200 { results: [{ jobId, status, result?, error? }, ...] }` (unknown job IDs are omitted from `results`)
- `POST /todoist-jobs` — `{ actionItemId, title, description?, dueDate? }` → `201 { jobId }`
- `GET /todoist-jobs/:jobId` — `200 { jobId, status, result?, error? }` (`result` is `{ actionItemId, todoistTaskId }` on success), `404` if unknown
- `POST /todoist-jobs/status` — `{ jobIds: [...] }` → `200 { results: [...] }`, same shape as `/jobs/status`
- `POST /calendar-event-jobs` — `{ calendarEventId, title, date, startTime, description?, endTime? }` → `201 { jobId }`
- `GET /calendar-event-jobs/:jobId` — `200 { jobId, status, result?, error? }` (`result` is `{ calendarEventId, googleEventId }` on success), `404` if unknown
- `POST /calendar-event-jobs/status` — `{ jobIds: [...] }` → `200 { results: [...] }`, same shape as `/jobs/status`

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
   mounts the [Bull Board](https://github.com/felixmosh/bull-board) queue-inspection UI. Every
   worker this package owns — `extract-action-items` included — starts right here too, each one
   only once its own env vars are set (see the env var table above); set
   `GMAIL_CLIENT_ID`/`_SECRET`/`_REFRESH_TOKEN` and `OPENROUTER_API_KEY` in `.env` to exercise
   `extract-action-items` against a real Gmail account and OpenRouter locally.

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

### Evaluating the extraction prompt (`eval/`)

`eval/extractActionItems.eval.test.ts` and `eval/reviewedFixtures.eval.test.ts` are manual-run-only
eval harnesses for `src/modules/email-processing/queues/extract-action-items/prompts/extractActionItems.system.md` — a set of
fixture emails (`eval/fixtures.ts`/`eval/reviewedFixtures.ts`) run through the exact same
extraction call `src/modules/email-processing/queues/extract-action-items/jobProcessor.ts` runs for a real job (a real
OpenRouter call, via the same `createOpenRouterExtractor(...)` the worker uses — see
`eval/runFixtureSuite.ts`), each checked against expectations on how many action items should come
back and what they should say (`events` isn't asserted on here yet — see `eval/fixtures.ts`'s
`EvalFixture` shape). It's for iterating on the prompt by hand: change the wording, rerun, see
which fixtures moved.

It **never runs in CI** — it's outside `vitest`'s `src/**/*.{test,spec}.ts` include glob and outside
`tsc`'s `include` (`src` only), and it needs a real `OPENROUTER_API_KEY`, same reason the real
OpenRouter calls are excluded from `openRouter.test.ts`. Run it by hand:

```bash
OPENROUTER_API_KEY=... pnpm --filter task-manager eval

# Only fixtures whose name contains this substring
OPENROUTER_API_KEY=... pnpm --filter task-manager eval -- -t due-date

# Against a non-default model
OPENROUTER_API_KEY=... OPENROUTER_MODEL=some/other-model:free pnpm --filter task-manager eval
```

`OPENROUTER_API_KEY`/`OPENROUTER_MODEL`/`OPENROUTER_BASE_URL` can also be set once in `.env` (see
`.env.example`) instead of prefixing every invocation by hand — `eval/vitest.config.ts` loads the
same `.env` file `server.ts` does.

Each fixture asserts on the number of action items returned (exact, or a `{min, max}` range for
cases where the model has legitimate latitude) and, per item, substring/regex checks on
`title`/`description` and whether a `dueDate` is present/absent/an exact value. Assertions are
loose on purpose — the model's wording varies run to run — so failures should point at the
*substance* of the pipeline going wrong, not phrasing drift. Free-tier model output is
non-deterministic too, so a fixture or two flipping between runs is expected; treat it as a trend
to watch across a prompt change, not a hard CI-style gate. Exits non-zero if any fixture had a
failing assertion.

Add a fixture whenever `extractActionItems.system.md` gains a new rule, or whenever a real email
turns out to trick extraction into misclassifying something.

## Decommissioning the old Mac worker

If you installed the old Mac-only `extract-action-items` worker (the LaunchAgent from #251, back
when it called a local LM Studio server instead of OpenRouter), it's now redundant — the same
queue is consumed by `server.ts` in the cloud, see "Email action-item extraction" above — and safe
to remove. On the Mac it was installed on:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
rm ~/Library/LaunchAgents/com.ertrzyiks.task-manager-worker.plist
rm -rf <repo-checkout>/apps/task-manager/dist-bin
security delete-generic-password -a task-manager-worker -s redis-url
security delete-generic-password -a task-manager-worker -s gmail-client-id
security delete-generic-password -a task-manager-worker -s gmail-client-secret
security delete-generic-password -a task-manager-worker -s gmail-refresh-token
rm -rf ~/.task-manager
```

(`launchctl bootout` is a no-op if the agent wasn't currently loaded; each `security
delete-generic-password` is a no-op — with a "could not be found" message — for any item that was
never provisioned or already removed.) You can also quit/uninstall LM Studio itself at this point
if nothing else on the machine still uses it.

## Library loan -> Google Calendar sync

A second sync job, unrelated to Todoist above: keeps a Google Calendar event in sync with
every currently-borrowed library book (WBPG, https://katalog.wbpg.org.pl/), so a return date shows
up on the calendar instead of only in the library's own app. Built from a feasibility spike — see
`scripts/wbpg-library-spike/README.md` for how the WBPG API was reverse-engineered (no public docs
exist for it) and what was confirmed against a real account.

Two more `Worker`s started inside `server.ts`, same as `sync-todoist` — not a separate Dokku
process type. This used to be a standalone entry point (`librarySyncWorker.ts`) requiring its own
`Procfile` process type and a manual `dokku ps:scale` step; folded into `server.ts` since neither
WBPG login (username/password, not OAuth) nor Google Calendar needs anything Mac-local, matching
the one existing precedent (Todoist) instead of being the odd one out. `refresh-library-loans` runs
as a BullMQ repeatable job
(`upsertJobScheduler`, cron pattern `LIBRARY_REFRESH_CRON_PATTERN`, see "What is the schedule?"
below); its `Worker` calls `libraryRefresh.ts`, which fans out one `sync-loan-calendar` job per
current loan onto the second queue, consumed by the second `Worker`.

### How it fits together

- `src/modules/loans/queues/refresh-library-loans/library.ts` — the WBPG client (login, walk every linked sub-account via
  `/api/auth/user/subusers` + `/api/auth/user/change`, collect current loans; also resolves branch
  ("filia") id -> name from the public `/api/setting/all`).
- `src/modules/loans/loansStore.ts` — sqlite (`node:sqlite`, no native dependency, unlike `better-sqlite3` —
  matters here because the Dockerfile's `slim` runtime image has no compiler toolchain to build a
  native binding against, see that file's `--ignore-scripts` comment). Two tables: the
  current-loans snapshot, and one row per (filia, return-date day)
  group that's ever gotten a calendar event — see that file's header comment for why the event is
  keyed by *group*, not by individual loan (a prolongation can move a loan into a different
  group, and a per-loan pointer would go stale in a way that's easy to apply to the wrong event).
- `src/googleCalendarClient.ts` — thin Google Calendar client (create/update/delete/check an
  event); shared with `sync-calendar-events` (see "Calendar event sync" above), not loans-specific
  despite being written for this feature first.
- `src/modules/loans/queues/sync-loan-calendar/loanCalendarSync.ts` — the actual "sync one loan's event" decision logic, independent of
  BullMQ (mirrors `jobProcessor.ts`'s split) — one book due back at a filia joins whatever event
  already covers that filia+day, creating one if none exists yet; every run recomputes the whole
  group's description so it converges regardless of which loan's job happens to run first, no
  merge step needed even when a prolongation moves a book out of a shared event (see
  `loanCalendarSync.test.ts`'s "prolonged out of a group" test).
- `src/modules/loans/queues/refresh-library-loans/libraryRefresh.ts` — the periodic "check WBPG, replace the loans snapshot, fan out one
  `sync-loan-calendar` job per current loan, garbage-collect calendar events for groups no loan
  belongs to any more" logic (also independent of BullMQ).
- `src/modules/loans/queues/refresh-library-loans/queue.ts`/`worker.ts` and
  `src/modules/loans/queues/sync-loan-calendar/queue.ts`/`worker.ts` — the BullMQ wiring for the two queues this
  sync uses (the `Queue`/queue name, and the `Worker` that wraps `libraryRefresh.ts`/
  `loanCalendarSync.ts` above with its `ready`/`failed` listeners) — see "Queue layout" below for
  the convention every queue in this package follows.
- `src/modules/loans/libraryConfig.ts` — typed env var loading for the five WBPG/Calendar vars plus their
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
   sync workers start automatically once those five vars are set, same as Todoist. This runs
   against the *real* WBPG and Google Calendar — there's no fake-deps mode here; the pure
   sync/refresh logic is what `loanCalendarSync.test.ts` and `libraryRefresh.test.ts` exist to
   cover without needing either.
4. **Deploying**: nothing beyond the existing `release_task_manager.yml` — it already builds and
   ships this app's whole `dist/` to the same Dokku app the Jobs API server deploys to, and since
   this runs inside `server.ts` (the app's only process type), no `ps:scale` step is needed.
   `terraform/main.tf`'s `dokku_app.task_manager` needs the six env vars above added to its
   `config` block (sourced from new 1Password items — this repo's convention, see e.g. how
   `GMAIL_REFRESH_TOKEN` is wired for `personal_assistant` in that file) and a `storage` mount at
   `/app/data` (matching `DATABASE_PATH`'s default, same pattern as `kstatus`/`personal_assistant`
   in that file) for the sqlite file to survive redeploys. The terraform change is written; the
   1Password items themselves are a **manual follow-up step**, same division of labor as
   `scripts/gmail-oauth/`'s manual 1Password step for the `extract-action-items` worker's Gmail
   credential.

### What's verified vs. not

- **Verified**: the WBPG login/cookie/endpoint flow (`scripts/wbpg-library-spike/`, run against a
  real account); `library.ts`'s request/response handling and pagination (`library.test.ts`, via
  an injected fake `fetch`, mirroring `openRouter.test.ts`); the sqlite store, the per-loan sync
  decision logic (including grouping, rescheduling on a prolonged return date, recovering from an
  event deleted out from under it, and a book leaving a shared event via prolongation), and the
  refresh/fan-out/garbage-collection logic — all fully unit-tested with fakes or a real in-memory
  sqlite db (`loansStore.test.ts`, `loanCalendarSync.test.ts`, `libraryRefresh.test.ts`);
  `tsc`/`vitest`/`pnpm --filter task-manager build` all pass clean with these workers included;
  `server.ts` itself boots against a real local Redis with dummy WBPG/Calendar credentials and
  Bull Board correctly reports both library queues.
- **Not verified**: `googleCalendarClient.ts`'s actual calls against real Google Calendar
  infrastructure (same situation `gmail.ts`'s `createGmailFetcher` has always been in — nothing to
  talk to in CI/sandbox; also unverified for its other caller, `sync-calendar-events` — see
  "Calendar event sync" above); the full pipeline end-to-end against a real WBPG account and real
  Google Calendar together; the terraform/1Password wiring above, which references six 1Password
  items that don't exist yet — `terraform plan`/`apply` will fail until they're created by hand (same manual step
  this repo's other integrations have always needed, e.g. `scripts/gmail-oauth/README.md`'s own
  1Password step).
