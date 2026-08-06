# Research: free, lightweight dashboard/observability options for task-manager and personal-assistant

Ticket: [ertrzyiks/ertrzyiks.me#295](https://github.com/ertrzyiks/ertrzyiks.me/issues/295), part of
[Map: Task-manager & personal-assistant observability (#294)](https://github.com/ertrzyiks/ertrzyiks.me/issues/294).
Feeds the follow-up decision ticket [#297](https://github.com/ertrzyiks/ertrzyiks.me/issues/297).

Scope recap, from #294/#295: pick a **free**, **lightweight**, **no-new-database-to-maintain**
tool usable by both `task-manager` (BullMQ + Redis queue, already has a dev-only
[Bull Board](https://github.com/felixmosh/bull-board) at `/admin/queues`, see
`apps/task-manager/src/bullBoard.ts`) and `personal-assistant` (a SQLite `emails` table —
`status` + `error_message` columns — with no dashboard today, see
`apps/personal-assistant/src/store.ts`), both Dokku-hosted on a small host. Snapshot-only
(current counts by status + failure detail) is sufficient; no self-hosted Prometheus/
Grafana-class stack. **This document surveys options and their tradeoffs only — it does not
choose one.**

## A note on sources and access

Claims below are traced to each project's own docs/source/pricing page. A few primary domains
(`docs.taskforce.sh`'s pricing content, `npmjs.com` package pages) either returned thin/loading
content or an HTTP 403 on direct fetch; where that happened it's noted inline and the claim is
either sourced from a reachable mirror (GitHub source/README) or flagged as unconfirmed rather
than filled in from a secondary blog.

---

## 0. What each service already exposes (sets the integration surface)

- **task-manager**: the dev server already imports a concrete BullMQ `Queue` and mounts Bull
  Board's Fastify adapter at `/admin/queues` (`apps/task-manager/src/bullBoard.ts`) — full
  read/write job inspection, but only wired into `devServer.ts`, never `server.ts` (what Dokku
  runs). BullMQ's own `Queue` class (via its `QueueGetters` mixin,
  [`taskforcesh/bullmq` `src/classes/queue-getters.ts`](https://github.com/taskforcesh/bullmq/blob/master/src/classes/queue-getters.ts))
  exposes `getJobCounts(...types)` → `{[status]: number}` for snapshot counts, and
  `getFailed()`/`getJobs(['failed'])` → `Job[]`, each with a `failedReason: string` property
  (confirmed in [`taskforcesh/bullmq` `src/classes/job.ts`](https://github.com/taskforcesh/bullmq/blob/master/src/classes/job.ts):
  `/** Reason for failing. */ failedReason: string;`, set from `err?.message` in `moveToFailed`).
  So both "counts by status" and "failure detail" are already one BullMQ API call away, without
  Bull Board.
- **personal-assistant**: `apps/personal-assistant/src/store.ts` opens a plain file-backed SQLite
  database via Node's built-in `node:sqlite` (`new DatabaseSync(path)`, default
  `/app/data/personal-assistant.sqlite`), with an `emails` table (`status`, `error_message`,
  `job_id`, timestamps) and an `action_items` table. No ORM, no proprietary format — any tool that
  can open a standard SQLite file can read it directly, which is exactly what the "no new
  database" constraint allows.

---

## 1. Self-hosted, generic SQLite viewers/browsers (fit: personal-assistant primarily)

These read the existing `personal-assistant.sqlite` file directly — no new database, per the
ticket's explicit carve-out.

### Datasette

- "An open source multi-tool for exploring and publishing data," Apache 2.0 licensed, Python
  package (`pip install datasette`), basic usage is `datasette serve path/to/database.db`.
  [`simonw/datasette` GitHub repo](https://github.com/simonw/datasette) — supports license,
  install command, SQLite-file usage.
- Deployment docs cover running it as a systemd service behind nginx/Apache reverse proxies, or
  "Deploying using buildpacks" (relevant since Dokku is itself buildpack-based).
  [Datasette docs — Deploying](https://docs.datasette.io/en/stable/deploying.html) — supports
  systemd/proxy/buildpack deployment paths.
- **No built-in password/basic-auth**: "Datasette currently leaves almost all forms of
  authentication to plugins," with only a local-only "root" debug account built in; third-party
  plugins like `datasette-auth-github` exist but auth is not first-party.
  [Datasette docs — Authentication and permissions](https://docs.datasette.io/en/stable/authentication.html)
  — supports the "leaves auth to plugins" statement. (Dokku's own `dokku-http-auth` plugin, §5
  below, sidesteps this by putting Basic Auth in front of the app instead.)
  A read-only viewing posture is achievable by pointing Datasette at the file without any special
  flag needed beyond normal SQLite read access — Datasette is fundamentally a read/query/publish
  tool, not a row-editor, unlike sqlite-web below.
- **"Datasette Cloud" is not a usable option today**: its own site currently shows "Coming soon,"
  sponsored by Fly.io, with no live product. [datasettecloud.com](https://www.datasettecloud.com/)
  `[via WebSearch snippet]` — supports the "coming soon" status. Self-hosting the open-source
  package is the only currently-real path.

### sqlite-web

- A Flask-based (Python) web browser/editor for SQLite files, MIT licensed. Dependencies: `flask`,
  `peewee`, `pygments`. Supports password protection (`-P` flag or `SQLITE_WEB_PASSWORD` env var),
  Docker deployment, and a `-r` read-only flag; without `-r` it allows full row/table/column
  insert/update/delete and arbitrary SQL execution, plus JSON/CSV import-export.
  [`coleifer/sqlite-web` GitHub repo](https://github.com/coleifer/sqlite-web) — supports license,
  dependencies, `-P`/`SQLITE_WEB_PASSWORD` auth, `-r` read-only mode, edit/import-export
  capabilities.
- Unlike Datasette, it ships its own password gate out of the box, which lines up more directly
  with map #294's Basic-Auth requirement without needing a Dokku-level plugin (though that's still
  an option, see §5) — but its default write-enabled posture is a bigger surface than the
  read-only "snapshot" the ticket asks for, so `-r` (or an equivalent restriction) is the relevant
  mode here, not the default.

### Adminer

- "Database management in a single PHP file," Apache License/GPL 2 dual-licensed, requires PHP
  5.3+/7/8 with sessions enabled, and lists SQLite among its supported engines (alongside MySQL,
  PostgreSQL, MS SQL, etc). Has its own login screen; "does not allow connecting to databases
  without a password and it rate-limits the connection attempts." [adminer.org](https://www.adminer.org/)
  — supports license, PHP requirement, SQLite support, and login/rate-limiting behavior.
- General-purpose SQL admin tool rather than a queue-aware BullMQ dashboard, so it only ever
  covers the personal-assistant half — it has no notion of Redis/BullMQ at all. Lightest possible
  footprint of the three (one PHP file), but PHP is not a runtime the rest of this repo uses
  (task-manager/personal-assistant are both Node/TypeScript), so it'd be a new language/runtime
  on the host purely for this.

---

## 2. BullMQ-aware dashboards beyond Bull Board (fit: task-manager primarily)

### Taskforce.sh (hosted, by BullMQ's own authors)

- Described in its own docs as "a front end for managing Bull/BullMQ instances," built by the
  BullMQ authors themselves. [docs.taskforce.sh](https://docs.taskforce.sh/) — supports the
  "front end for managing Bull/BullMQ" description.
- **Pricing/free-tier details could not be confirmed from the primary source in this pass**:
  `taskforce.sh/pricing` returned only a client-side-rendered loading shell to the fetch tool used
  here, and WebSearch results independently describe it as "a paid service" / "professional
  dashboard," contrasted against free/open-source Bull Board, without surfacing a specific free
  tier's limits. [taskforce.sh](https://taskforce.sh/) — supports "professional dashboard,"
  paid-service framing; **exact free-tier existence/limits are an open gap, flagged rather than
  guessed** — worth a direct account-creation check before any decision ticket relies on this
  option being free.

### Bull Monitor (`ejhayes/bull-monitor`, formerly under a different maintainer)

- "An all-in-one tool to help you visualize and report on bull" — auto-discovers queues, exposes
  Prometheus metrics, and (per its own README's UI framing) can front multiple UI implementations
  including bull-board, Arena, and "bull-master." Requires the same Redis instance BullMQ already
  uses, runs via Docker or Node.js locally, and optionally wires up Prometheus/Grafana for metrics
  visualization and an OAuth2 proxy for auth (disabled by default).
  [`ejhayes/bull-monitor` GitHub repo](https://github.com/ejhayes/bull-monitor) — supports
  description, Redis/Docker requirement, optional Prometheus/Grafana/OAuth2-proxy integration.
  A December 2025 draft PR for a 2.0.0 release is visible on the repo, indicating it's not
  abandoned. `[via WebSearch snippet of repo activity]`
- Its optional Prometheus/Grafana path is exactly the "heavyweight self-hosted stack" the map
  rules out — but that path is optional; the core tool can run without it, standalone against
  Redis.

### Arena (`mixmaxhq/arena`)

- "An intuitive Web GUI for Bee Queue, Bull and BullMQ," MIT licensed, Express-based, runnable
  standalone or as middleware, requiring Node.js 7.6+. States "preliminary support for BullMQ
  post-3.4.x." [`mixmaxhq/arena` GitHub repo](https://github.com/mixmaxhq/arena) — supports
  license, framework, Node version requirement, and the "preliminary BullMQ support" wording.
  The latest `bull-arena` npm release (per search-indexed npm listing) is `4.9.2`, published
  roughly 8 months before this research (so within the last year) — actively maintained, not
  abandoned. `[via WebSearch snippet]`, direct `npmjs.com` fetch returned HTTP 403 in this sandbox.
- Node/TypeScript-native, same runtime family as task-manager itself, unlike Adminer/Datasette/
  sqlite-web (Python/PHP) — but it's Bull/BullMQ-only, with no SQLite awareness, so on its own it
  only ever covers task-manager's half, same one-sided-coverage caveat as Bull Monitor.

---

## 3. Build-your-own snapshot endpoint (fit: both, trivially satisfies every constraint)

Not a named "tool," but worth surveying since the ticket explicitly allows "anything else that
fits": both services already have every primitive needed to hand-roll a tiny `/admin/status`-style
JSON or HTML endpoint with zero new dependencies:

- task-manager: `queue.getJobCounts()` for counts by status, `queue.getFailed()`/`getJobs(['failed'])`
  for `job.failedReason` detail — both already part of BullMQ's public `Queue`/`QueueGetters` API
  (§0 above), no Bull Board or third-party package required.
- personal-assistant: a plain `SELECT status, COUNT(*) FROM emails GROUP BY status` and
  `SELECT id, error_message FROM emails WHERE status = 'failed'` against the existing
  `node:sqlite` `DatabaseSync` handle already opened by `store.ts` — no new table, no new file.

This trades "zero new dependency, full control over exactly what's shown" for "you write and
maintain the endpoint and its HTML/JSON rendering yourself" — it's the baseline every packaged
tool above is being weighed against, not a competing product with its own docs to cite.

---

## 4. General-purpose free-tier hosted/self-hosted BI tools that could unify both services

The map's spirit is "one tool for both, two separate views" — none of the BullMQ-only or
SQLite-only tools above do that alone. These are broader tools that, in principle, could point at
both a SQLite file and *some* representation of BullMQ/Redis data from one deployment.

### Metabase (self-hosted, open source)

- SQLite is an **officially supported, built-in driver** (not a community plugin) in self-hosted
  Metabase — set up via Admin → Databases → Add a database → absolute path to the `.db` file.
  Explicitly **not available on Metabase Cloud**, self-hosted only.
  [Metabase docs — SQLite](https://www.metabase.com/docs/latest/databases/connections/sqlite) —
  supports built-in-driver status, setup steps, and the Cloud exclusion.
  Metabase itself is open source and self-hostable for free (Apache-2.0-licensed OSS edition,
  ~48.6k GitHub stars per the docs page's own repo reference).
- No Redis/BullMQ connector exists in Metabase's own driver list checked here — task-manager's
  side would need a translation layer (e.g. the build-your-own endpoint from §3, exposed as CSV/
  JSON Metabase could ingest, or writing snapshot rows into a table Metabase can query), which
  starts to look like "a new thing to maintain" even if it isn't literally "a new database." Best
  fit as a personal-assistant-only option unless paired with an extra bridge for task-manager.

### Grafana Cloud (hosted, free tier) — named for completeness, in tension with the map's own exclusion

- Grafana Cloud's free tier is confirmed **permanently free, not a trial**: e.g. metrics limited
  to 10k active series/14-day retention, logs/traces/profiles to 50 GB ingested/14-day retention,
  3 active dashboard users/month, community support only.
  [grafana.com/pricing](https://grafana.com/pricing/) — supports the free-tier limits listed.
- Even hosted off-box, actually feeding it requires a metrics/logs pipeline (a Prometheus
  `remote_write` exporter, or a logs shipper) from both services — which is precisely the
  "Prometheus/Grafana-class" shape map #294 rules out, even though the *hosting* itself is free
  and off-box. Listed here only so the tradeoff is explicit: the free tier is real, but adopting
  it still means building/maintaining an exporter, which conflicts with "lightweight" and "no new
  thing to maintain" in spirit even if not in the letter of "database."

### Retool (hosted, free tier)

- Confirmed genuinely free (not a trial): up to 5 users, unlimited web/mobile apps, "connect to
  all databases and APIs," 500 workflow runs/month, 5 GB data storage.
  [retool.com/pricing](https://retool.com/pricing) — supports the free-tier limits listed.
- Retool is a low-code app builder, not a pre-built dashboard — someone would hand-build the
  status view by wiring a SQLite connector (if one exists in Retool's resource library; not
  independently verified here) and/or a custom REST resource pointed at a small task-manager/
  personal-assistant HTTP endpoint (i.e., it still leans on something like §3's endpoint for the
  BullMQ side). Meaningfully heavier to adopt than a viewer that just needs a file path.

---

## 5. Cross-cutting: Basic Auth in front of any self-hosted option

Whatever self-hosted tool is chosen, Dokku itself already ships an official plugin for exactly
map #294's "Basic Auth, browser-friendly" requirement, independent of whether the tool has its own
auth:

- `dokku/dokku-http-auth`: install via `dokku plugin:install
  https://github.com/dokku/dokku-http-auth.git` (Dokku 0.4+), then `http-auth:enable <app> [<user>
  <password>]`, with further commands to add/remove users, restrict by IP/domain, and inspect the
  generated nginx config. Credentials are stored as SHA-512 hashes in
  `/etc/nginx/http-auth/<app>/htpasswd`.
  [`dokku/dokku-http-auth` README](https://github.com/dokku/dokku-http-auth/blob/master/README.md)
  — supports install command, `http-auth:enable`/`add-user`/`remove-user` commands, and the
  htpasswd storage location.

This means Datasette's lack of built-in auth, or any other option's auth story, doesn't have to be
solved by the tool itself if it's deployed as its own small Dokku app — Dokku's own nginx layer
can gate it.

---

## 6. Complementary alerting (explicit bonus per #294, not required)

None of these are dashboards in the "current counts" sense the ticket asks for, but they're
free/lightweight and could sit next to whichever snapshot tool is chosen, since alerting was
flagged as optional bonus scope:

- **Healthchecks.io**: cron/dead-man's-switch monitoring — pings expected on a schedule, alerts if
  they don't arrive. Genuinely free "Hobbyist" tier (not a trial): 20 monitored jobs, 100 log
  entries/job. Also **open source (BSD-3-Clause) and self-hostable** (Django + Python 3.12+,
  Postgres/MySQL/MariaDB, Docker images available) if the hosted free tier's limits ever matter.
  [healthchecks.io/pricing](https://healthchecks.io/pricing/) — supports free-tier limits.
  [`healthchecks/healthchecks` GitHub repo](https://github.com/healthchecks/healthchecks) —
  supports license, self-hostability, tech stack.
- **Sentry**: free "Developer" tier confirmed genuinely free (not a trial): 5,000 errors/month, 1
  user, 30-day retention, and explicitly **1 free cron monitor** (additional monitors are paid
  add-ons). [sentry.io/pricing](https://sentry.io/pricing/) — supports free-tier limits and cron
  monitor count.
- **UptimeRobot**: free plan confirmed genuinely free, no card required: 50 monitors, 5-minute
  interval, email/SMS/voice alerts, 1 status page, 3-month retention.
  [uptimerobot.com/pricing](https://uptimerobot.com/pricing/) — supports free-tier limits.
- **Better Stack**: free tier confirmed genuinely free: 10 monitors/heartbeats, 1 status page, 3
  GB logs/traces/events retained 3 days, 100k exceptions/month, unlimited "Telemetry access" team
  members. [betterstack.com/pricing](https://betterstack.com/pricing) — supports free-tier limits.

All four are "ping an endpoint / receive an event, alert on absence or error" tools, not
data-browsing dashboards — they'd complement, not replace, whichever snapshot-viewing option is
chosen.

---

## Comparison summary

| Option | Covers | New runtime on host? | Own auth? | Free tier is genuine (not trial)? | Notes |
|---|---|---|---|---|---|
| Datasette | personal-assistant (SQLite) | Python | No (plugin-only) | N/A — self-hosted OSS, Apache 2.0 | Read/publish-oriented, not an editor by default |
| sqlite-web | personal-assistant (SQLite) | Python | Yes (`-P`/env var), `-r` read-only flag | N/A — self-hosted OSS, MIT | Full CRUD by default; use `-r` for a snapshot-only posture |
| Adminer | personal-assistant (SQLite) | PHP | Yes, built-in login | N/A — self-hosted OSS | New language runtime (PHP) not otherwise used in this repo |
| Taskforce.sh | task-manager (BullMQ) | None (hosted) | Hosted account | **Unconfirmed** — pricing page didn't render in this pass | Built by BullMQ's own authors; verify free-tier existence directly before relying on it |
| Bull Monitor (`ejhayes`) | task-manager (BullMQ) | Node/Docker | Optional OAuth2 proxy | N/A — self-hosted OSS | Prometheus/Grafana wiring is optional, not required |
| Arena | task-manager (BullMQ, "preliminary") | Node | Not documented in the fetched README | N/A — self-hosted OSS, MIT | Same Node/TS runtime as task-manager; actively published (npm `4.9.2` within the last year) |
| Build-your-own endpoint | Both | None | Whatever you add (e.g. dokku-http-auth) | N/A | Zero new dependency; you own the code |
| Metabase | personal-assistant well; task-manager needs a bridge | Java (Metabase's own runtime) | Built-in | N/A — self-hosted OSS, Apache 2.0 | No native BullMQ/Redis connector found |
| Grafana Cloud | Both, in principle | None (hosted) | Built-in | Yes, confirmed permanently free | Needs a metrics/logs exporter pipeline — the "Grafana-class" shape the map excludes, despite being free/hosted |
| Retool | Both, if hand-wired | None (hosted) | Built-in | Yes, confirmed (5 users) | Low-code builder, not a pre-built dashboard; still needs a data bridge for BullMQ |
| Healthchecks.io / Sentry / UptimeRobot / Better Stack | Alerting bonus, not snapshot dashboards | None (hosted; Healthchecks.io also self-hostable) | Built-in | Yes, all confirmed | Complementary to, not a substitute for, a status-viewing tool |

No option is picked here — that's explicitly deferred to the follow-up decision ticket
[#297](https://github.com/ertrzyiks/ertrzyiks.me/issues/297).

---

## 7. Integration consideration flagged for whichever option is chosen: concurrent SQLite access

`personal-assistant`'s `store.ts` opens the database as `new DatabaseSync(path)` with no journal
mode set — Node's own `node:sqlite` docs don't document a default journal mode or WAL-mode
guidance, only that `DatabaseSync` represents a single connection and that `db.exec("PRAGMA
journal_mode = WAL")` is how you'd change it if needed.
[Node.js docs — SQLite (`node:sqlite`)](https://nodejs.org/api/sqlite.html) — supports the
constructor options table (including a `readOnly` option) and the absence of documented default
journal-mode guidance.

SQLite's own docs confirm WAL mode is what enables non-blocking concurrent reads while a writer is
active ("readers do not block writers and a writer does not block readers"), but requires all
processes to be on the same host (true here — Dokku hosts both the app and, presumably, any viewer
deployed alongside it) and shared-memory coordination; without WAL, a viewer reading the file while
`personal-assistant` writes to it risks a transient `SQLITE_BUSY` rather than being fundamentally
unsafe. [SQLite docs — Write-Ahead Logging](https://sqlite.org/wal.html) — supports the WAL
concurrency behavior, same-host requirement, and `SQLITE_BUSY` caveat.

Any file-reading viewer (Datasette, sqlite-web, Adminer, a hand-rolled endpoint) should open the
file read-only where the tool supports it (`node:sqlite`'s own `readOnly` constructor option, or
Datasette/sqlite-web's read-only flags) to avoid any risk of a viewer process writing back to the
same file `personal-assistant` owns — this is a configuration choice available in every option
surveyed, not a blocker on any of them.

---

## Sources index

- BullMQ — `QueueGetters` source (`getJobCounts`, `getFailed`, etc.): https://github.com/taskforcesh/bullmq/blob/master/src/classes/queue-getters.ts — fetched directly
- BullMQ — `Job` class source (`failedReason`): https://github.com/taskforcesh/bullmq/blob/master/src/classes/job.ts — fetched directly
- BullMQ — Getters docs (search-indexed, confirms `getJobCounts` shape): https://docs.bullmq.io/guide/jobs/getters — via WebSearch snippet
- felixmosh/bull-board (existing dev-only dashboard, for context): https://github.com/felixmosh/bull-board — referenced from repo README, not re-fetched
- Datasette — GitHub repo (license, install, SQLite usage): https://github.com/simonw/datasette — fetched directly
- Datasette — Deploying docs: https://docs.datasette.io/en/stable/deploying.html — fetched directly
- Datasette — Authentication docs: https://docs.datasette.io/en/stable/authentication.html — fetched directly
- Datasette Cloud — status page: https://www.datasettecloud.com/ — via WebSearch snippet
- sqlite-web — GitHub repo: https://github.com/coleifer/sqlite-web — fetched directly
- Adminer — official site: https://www.adminer.org/ — fetched directly
- Taskforce.sh — docs home: https://docs.taskforce.sh/ — fetched directly (thin content)
- Taskforce.sh — pricing page: https://taskforce.sh/pricing — fetched directly, rendered as a client-side loading shell; pricing not confirmed
- Taskforce.sh — marketing/framing (via search): https://taskforce.sh/ — via WebSearch snippet
- Bull Monitor — GitHub repo: https://github.com/ejhayes/bull-monitor — fetched directly
- Arena — GitHub repo: https://github.com/mixmaxhq/arena — fetched directly
- `bull-arena` npm version/publish recency: via WebSearch snippet (direct `npmjs.com` fetch returned HTTP 403 in this sandbox)
- Metabase — SQLite connection docs: https://www.metabase.com/docs/latest/databases/connections/sqlite — fetched directly
- Grafana Cloud — pricing: https://grafana.com/pricing/ — fetched directly
- Retool — pricing: https://retool.com/pricing — fetched directly
- dokku/dokku-http-auth — README: https://github.com/dokku/dokku-http-auth/blob/master/README.md — fetched directly
- Healthchecks.io — pricing: https://healthchecks.io/pricing/ — fetched directly
- Healthchecks.io — GitHub repo (self-hostability, license, stack): https://github.com/healthchecks/healthchecks — fetched directly
- Sentry — pricing: https://sentry.io/pricing/ — fetched directly
- UptimeRobot — pricing: https://uptimerobot.com/pricing/ — fetched directly
- Better Stack — pricing: https://betterstack.com/pricing — fetched directly
- Node.js docs — `node:sqlite` (`DatabaseSync` options, `readOnly`): https://nodejs.org/api/sqlite.html — fetched directly
- SQLite docs — Write-Ahead Logging: https://sqlite.org/wal.html — fetched directly
- `apps/task-manager/README.md` and `apps/task-manager/src/bullBoard.ts` — this repo
- `apps/personal-assistant/README.md` and `apps/personal-assistant/src/store.ts` — this repo
- ertrzyiks/ertrzyiks.me issue #294 (map) — https://github.com/ertrzyiks/ertrzyiks.me/issues/294
- ertrzyiks/ertrzyiks.me issue #295 (this ticket) — https://github.com/ertrzyiks/ertrzyiks.me/issues/295
- ertrzyiks/ertrzyiks.me issue #297 (follow-up decision ticket) — https://github.com/ertrzyiks/ertrzyiks.me/issues/297
