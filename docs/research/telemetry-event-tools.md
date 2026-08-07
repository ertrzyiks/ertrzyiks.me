# Research: free, lightweight telemetry/event-ingestion SaaS options for task-manager and personal-assistant

Ticket: [ertrzyiks/ertrzyiks.me#299](https://github.com/ertrzyiks/ertrzyiks.me/issues/299), part of
[Map: Task-manager & personal-assistant observability (#294)](https://github.com/ertrzyiks/ertrzyiks.me/issues/294).
Sibling to [Research free, lightweight, no-new-database dashboard/observability tools (#295)](https://github.com/ertrzyiks/ertrzyiks.me/issues/295)
(see `docs/research/dashboard-observability-tools.md` on the `research/dashboard-observability-tools`
branch). Feeds the follow-up decision ticket [#297](https://github.com/ertrzyiks/ertrzyiks.me/issues/297)
alongside #295's findings.

Scope recap, from #294/#299: where #295 surveyed tools that read `task-manager`'s BullMQ/Redis
queue or `personal-assistant`'s existing SQLite file **directly** (Datasette, sqlite-web, Bull
Monitor, Arena, a build-your-own snapshot endpoint, general BI tools), this ticket covers the
different shape where the app instead **emits structured events** — "email completed", "email
failed: reason=...", job status-change events — to a hosted telemetry/log-ingestion SaaS, which
renders the dashboard/aggregates on the vendor's side. Same hard constraints as #294/#295: free
(not a time-limited trial), no new database to maintain, lightweight (a small SDK/HTTP-call
integration per service is acceptable, a new service/agent to operate is not), and snapshot-only
is sufficient — no time-series/history requirement. **This document surveys options and their
tradeoffs only — it does not choose one.**

## A note on sources and access

Claims below are traced to each vendor's own pricing page, ingestion docs, and query-language
reference wherever a direct fetch succeeded. Several vendor doc paths guessed from the vendor's
own site structure 404'd on direct fetch in this pass (Honeycomb's query-builder page at its old
URL, Better Stack's SQL-editor page at a guessed path, Highlight.io's log-search page at a guessed
path, Axiom's arg-max page at a first-guessed path) — where that happened, a corrected URL was
found and re-fetched directly where possible, and is cited as such; where a WebSearch was used
instead to fill a specific gap (e.g. confirming an npm package's exact name via its npmjs.com
listing, since direct `npmjs.com` fetches have previously 403'd in this sandbox per #295's
experience, or confirming Logtail's brand-merge status), it is flagged inline as
`[via WebSearch snippet]` rather than silently presented as an equivalent primary fetch. No claim
below is sourced from a blog/listicle presented as if it were the vendor's own page.

---

## 0. What emitting events would actually add to each app

Both apps' natural event-emission points are already narrow and known from prior review, which
bounds how much new code every option below actually requires:

- **personal-assistant**: `apps/personal-assistant/src/store.ts`'s `markEmailFailed(emailId,
  errorMessage)` and `markEmailCompleted(emailId, actionItems)` are the two status-transition call
  sites (`queued -> completed` / `queued -> failed`) — an event-emission call slots in next to the
  existing SQLite write in each, not as a new subsystem. Critically, **personal-assistant has no
  inbound HTTP today** (a Dokku `worker:` process) — every option surveyed below only needs
  *outbound* HTTP (a `fetch()` POST to the vendor's ingest endpoint or an SDK wrapping the same),
  so this constraint doesn't block any of them, but it does rule out anything that would need
  personal-assistant to run its own always-on collector/agent process to receive/forward events
  locally before shipping them out — that would be a new inbound-capable service on a process that
  structurally doesn't have one today.
- **task-manager**: already a Fastify server with inbound HTTP (`apps/task-manager/src/bullBoard.ts`
  shows the existing dev-only Bull Board mount), so adding outbound event emission around BullMQ's
  job-completion/failure handlers is a smaller relative change — it already has an HTTP-capable
  runtime, just needs the emission calls added at the same status-transition points BullMQ itself
  exposes.

---

## 1. Axiom

- **Free tier**: the "Personal" plan is confirmed free, not a trial — "Permanent. No credit card
  required," listed at "$0/month" with 500 GB/month data ingest, 10 GB-hours/month query compute,
  25 GB storage, 30-day retention, "Full APL access," all integrations, and community support.
  [axiom.co/pricing](https://axiom.co/pricing) — supports the "Permanent. No credit card required"
  language and all limits listed.
- **Integration effort**: plain HTTP POST is fully sufficient and is shown as the primary example
  in Axiom's own docs — `POST https://AXIOM_DOMAIN/v1/ingest/DATASET_NAME` with an
  `Authorization: Bearer API_TOKEN` header and newline-delimited JSON body.
  [axiom.co/docs/send-data/ingest](https://axiom.co/docs/send-data/ingest) — supports the ingest
  endpoint shape, auth header, and NDJSON content type. Axiom also lists JavaScript/Node.js,
  Pino, and Winston integrations for teams that want a logging-library wrapper instead of a raw
  `fetch()` call, but none of these require a local collector or agent process — same doc, same
  page. For both task-manager (already has outbound HTTP) and personal-assistant (needs only
  outbound HTTP, which it already has via Node's built-in `fetch`), this is a handful of lines at
  each of the status-transition call sites in §0 — no new dependency required if using raw HTTP.
- **Dedup / latest-per-key query capability — the core question**: **confirmed supported.**
  Axiom's APL exposes an `arg_max` aggregation function specifically for this shape: "The `arg_max`
  aggregation in APL helps you identify the row with the maximum value for an expression and
  return additional fields from that record," with syntax
  `| summarize arg_max(expression, field1[, field2, ...])`.
  [axiom.co/docs/apl/aggregation-function/arg-max](https://axiom.co/docs/apl/aggregation-function/arg-max)
  — supports the function definition and syntax. The docs' own worked examples use it for maximum
  duration/status-code lookups rather than an explicit "latest event per email id by timestamp"
  walkthrough, but the pattern composes directly:
  `| summarize arg_max(_time, status) by email_id` would return each email id's most recent
  `status` value, which is exactly the "current counts by status" shape the ticket asks about —
  meaning counting raw ingested events naively (e.g. `count() by status`) would double-count every
  status transition an email goes through, but `arg_max`-based dedup avoids that by collapsing to
  one row per `email_id` first. This distinction is APL's own responsibility to solve at query
  time, not something Axiom's ingest layer does automatically — every event ingested is retained
  as its own row regardless of how a later query dedups it.
- **Dashboard access**: gated by Axiom account login, with optional SAML SSO (via WorkOS,
  supporting SCIM) for organizations — "SAML SSO allows you to keep access grants up-to-date with
  support for the industry standard SCIM protocol." No raw HTTP Basic Auth option is documented;
  access control is role/group-based under an account, not a shared Basic Auth credential pair.
  [axiom.co/docs/reference/settings](https://axiom.co/docs/reference/settings) — supports the SSO/
  SCIM description and the absence of a Basic-Auth-style gate. This differs from map #294's stated
  preference for browser-friendly Basic Auth — noted as a tension, not resolved here.

## 2. Honeycomb

- **Free tier**: confirmed free, not a trial — "Our introductory plan, free forever," positioned
  as "Best for testing and individual projects," with "Up to 20M [events] per month" and "Up to
  100M per month" metrics data points. [honeycomb.io/pricing](https://honeycomb.io/pricing) —
  supports the "free forever" language and event/metrics volume limits. The fetched page did not
  state retention limits or explicit credit-card language for the free tier specifically (only the
  Enterprise tier's "Request a trial" wording was visible), so those two points are an
  **unconfirmed gap** in this pass rather than assumed either way.
- **Integration effort**: Honeycomb's own Events API accepts direct JSON POST, independent of
  OpenTelemetry — "an Events endpoint for sending events as JSON objects to Honeycomb." A helper
  library, `libhoney` (published to npm as `libhoney`, `npm i libhoney`; Apache-2.0, maintained at
  [`honeycombio/libhoney-js`](https://github.com/honeycombio/libhoney-js)) wraps this for
  Node/JavaScript specifically. [docs.honeycomb.io/send-data/](https://docs.honeycomb.io/send-data/)
  — supports the Events-API-independent-of-OTel framing and the recommendation to use
  OpenTelemetry "if you are instrumenting code for the first time" while still allowing direct
  Events-API/`libhoney` use for simpler event emission. The npm package name and version were
  confirmed via its own npmjs.com listing `[via WebSearch snippet]` (direct `npmjs.com` fetches
  have previously 403'd in this sandbox, per #295). No collector/agent process is required for
  either integration path — both are outbound-only, matching personal-assistant's no-inbound-HTTP
  constraint from §0.
- **Dedup / latest-per-key query capability — the core question**: **not confirmed, and the
  negative finding is notable.** Honeycomb's query-builder aggregation-function reference lists
  `COUNT`, `COUNT(field)`, `COUNT_DISTINCT(field)`, `SUM`, `AVG`, `MAX`, `MIN`, percentile
  functions (`P001`–`P999`), `HEATMAP`, `CONCURRENCY` (tracing datasets only), rate functions, and
  metrics-specific functions — no function in this list retrieves "the row where X is max" the way
  Axiom's `arg_max` or New Relic's `latest()` do; `MAX(field)` returns only the maximum numeric
  *value* of a field, not the other fields from that row.
  [docs.honeycomb.io/investigate/query/build](https://docs.honeycomb.io/investigate/query/build) —
  supports the full aggregation-function list and confirms no "row at max" or dedup-style function
  appears in it. This means naive `COUNT() by status` in Honeycomb would double-count status
  transitions exactly as the ticket's core concern describes, and no clearly-documented
  first-party query pattern was found in this pass to avoid that — a materially different answer
  than Axiom's or New Relic's explicit support, and flagged here as an **unconfirmed/negative
  finding** rather than an assumption that some undocumented workaround exists (e.g. Honeycomb's
  BubbleUp is an anomaly-investigation UI feature for comparing an outlier group against a
  baseline, not a dedup/group-collapse query primitive, per the same page).
- **Dashboard access**: gated by Honeycomb account login, with optional Google Workspace SSO or
  SAML SSO via an external IdP (Okta, Microsoft Entra ID) — "Team Owners can require that team
  members authenticate using Single Sign-On (SSO)," with SAML/Entra SSO specifically called out as
  "part of the Honeycomb Pro and Enterprise plans" (i.e., not necessarily included on the free
  tier). `[via WebSearch snippet of docs.honeycomb.io SSO pages]` — supports the SSO description
  and the Pro/Enterprise gating of SAML specifically. No raw Basic Auth option was found. Same
  tension with map #294's Basic-Auth preference as every other hosted option here.

## 3. Better Stack (Telemetry/Logs)

- **Free tier**: Better Stack's pricing page lists its free plan as "$0/month" ("Free for personal
  projects") with, specific to the Logs/Telemetry product this ticket asks about: 3 GB logs
  retained for 3 days, 3 GB traces retained for 3 days, 3 GB web events retained for 3 days, 30 GB
  metrics, 100,000 exceptions/month, and 5,000 session replays.
  [betterstack.com/pricing](https://betterstack.com/pricing) — supports all limits listed. The
  fetched page did not itself carry explicit "free forever" or "no credit card required" language
  the way Axiom's and New Relic's pages do; secondary sources describe it both ways (some say no
  card required, at least one conflicting mention exists), so **the credit-card point specifically
  is a minor unconfirmed gap** in this pass, though #295's own research into Better Stack's
  uptime/alerting product independently treated the same $0/month free tier as "confirmed
  genuinely free," which is consistent with — but does not itself resolve — this narrower point.
  `[via WebSearch snippet]` for the credit-card-language cross-check specifically.
- **Brand note**: the product was formerly **Logtail** (a distinct product/domain) and has since
  been folded into the unified **Better Stack** platform/brand — "Logtail has been rebranded as
  Logs on the Better Stack platform... the two products are fully integrated, with no need to
  create another account or sign in separately." The client libraries still carry the old name
  (npm package `@logtail/node`, GitHub org `logtail`, e.g.
  [`logtail/logtail-js`](https://github.com/logtail/logtail-js)) but ship and are documented as
  "Better Stack Logs clients (formerly Logtail)." `[via WebSearch snippet]` — supports the
  rebrand/merge status and the still-`logtail`-named client libraries; this resolves the "check if
  it's now fully merged into Better Stack branding or still distinct" instruction from the ticket
  in favor of "merged, but with legacy-named client packages."
- **Integration effort**: a plain HTTP POST is directly documented and sufficient — `POST` to the
  ingesting host with `Authorization: Bearer $SOURCE_TOKEN` and a JSON body (`{"message": "...",
  ...}`), supporting JSON, NDJSON, or MessagePack, with batching via a JSON array, and an optional
  `dt` timestamp field ("By default, the time of the event will be the time of receiving it.").
  [betterstack.com/docs/logs/http-rest-api/](https://betterstack.com/docs/logs/http-rest-api/) —
  supports the endpoint shape, auth header, supported formats, and batching/timestamp behavior. No
  official npm package name is stated on this specific HTTP-API doc page, but the (formerly-
  Logtail-branded) `@logtail/node` package is Better Stack's own official Node.js logger, confirmed
  via its own npmjs.com listing. `npm i @logtail/node`; framework-specific wrappers also exist for
  Winston (`@logtail/winston`), Pino (`@logtail/pino`), and Bunyan (`@logtail/bunyan`).
  `[via WebSearch snippet of npmjs.com listings]` — supports package names and install commands.
  No collector/agent process is required for either the raw-HTTP or SDK path.
- **Dedup / latest-per-key query capability — the core question**: **partially confirmed, with a
  caveat about what's shown in Better Stack's own docs specifically.** Better Stack's log querying
  is built on ClickHouse SQL — "Log SQL queries use ClickHouse SQL, which is largely similar to
  ANSI SQL." `[via WebSearch snippet of betterstack.com/docs/logs/using-logtail/explore-logs/]` The
  fetched dashboards/SQL-queries doc page itself demonstrates `sumMerge()`/`avgMerge()`/
  `maxMerge()`-style aggregation patterns for metrics but does **not** itself show `argMax`,
  `LIMIT BY`, or window-function-based dedup patterns for getting the latest row per key.
  [betterstack.com/docs/logs/dashboards/sql-queries/](https://betterstack.com/docs/logs/dashboards/sql-queries/)
  — supports that this specific page's examples stop short of a dedup/latest-per-key walkthrough.
  However, ClickHouse itself — the engine Better Stack states it runs — natively supports exactly
  this pattern via its own `argMax(column, timestamp)` aggregate function ("the canonical way to
  fetch 'the latest record per user'... requiring only a single pass with no sort overhead"),
  which would be directly usable in Better Stack's SQL editor by ClickHouse-SQL-compatibility logic
  even though Better Stack's own docs page fetched here doesn't demonstrate it explicitly.
  `[via WebSearch snippet, general ClickHouse documentation, not Better Stack's own docs]` — this
  is flagged as an **inference from the underlying engine's general capability**, not a directly
  vendor-documented example, and is a materially weaker form of confirmation than Axiom's or New
  Relic's explicit, vendor-documented `arg_max`/`latest()` functions.
- **Dashboard access**: gated by Better Stack account login, with optional SSO for organizations
  (Google SAML, Okta with SCIM provisioning, Keycloak, Authentik, JumpCloud, and others) —
  "Configure Single Sign-On for your organization... only organization admins have access to these
  settings." `[via WebSearch snippet of betterstack.com/docs SSO pages]` — supports the SSO
  provider list and admin-only configuration gating. No raw Basic Auth option for the dashboard
  itself was found (note: Better Stack's separate *status page* product does support "Password, IP
  allowlist, and SSO protection," but that's a different surface than the Logs/Telemetry dashboard
  this ticket is about). Same tension with map #294's Basic-Auth preference as the rest.

## 4. Highlight.io

- **Fit assessment, stated honestly up front**: Highlight.io's own framing is "session replay,
  error monitoring, logging, distributed tracing" for full-stack web apps, with heavy emphasis on
  tying frontend session replay to backend errors — "Error monitoring in highlight.io is different
  than most tools, in that it emphasizes the mapping between your frontend and backend."
  `[via WebSearch snippet of github.com/highlight/highlight and highlight.io docs]` — supports the
  product framing. Neither task-manager nor personal-assistant has a frontend/browser session to
  replay; only the Logging (and possibly Error Monitoring) sub-products are relevant here, and the
  session-replay-centric parts of the product (the majority of its free-tier limit line items, see
  below) would go entirely unused for this use case. This is a materially different fit than the
  other options surveyed, which are general-purpose log/event sinks with no frontend assumption.
- **Free tier**: the "Free Forever" plan is "$0/month," with, per the pricing page: 500 monthly
  sessions, up to 1,000 monthly errors, up to 1,000,000 monthly logs, up to 25,000,000 monthly
  traces, 15 seats, 3-month retention for session replay/error monitoring, and 30-day retention for
  logging/traces. [highlight.io/pricing](https://highlight.io/pricing) — supports all figures
  listed and the "Free Forever" label. The page does not include explicit "no credit card
  required" language in what was fetched — flagged as an **unconfirmed gap** on that specific
  point, distinguishing it from Axiom's and New Relic's explicit statements.
- **Integration effort**: Highlight.io ships an official Node.js SDK, `@highlight-run/node`
  (`npm install --save @highlight-run/node`), initialized via `H.init({ projectID, serviceName,
  environment })`; errors are reported with `H.consumeError(error, ...)`, and console-based logging
  (`console.log`/`console.warn`) is automatically captured once the SDK is initialized — no local
  collector or agent process is required, it ships data directly to Highlight's cloud.
  [highlight.io/docs/getting-started/server/js/nodejs](https://www.highlight.io/docs/getting-started/server/js/nodejs)
  — supports the package name, init call shape, `consumeError` usage, and automatic console-log
  capture. This is a real SDK dependency (not just a raw HTTP POST recommended by the vendor's own
  docs, unlike Axiom/Better Stack/New Relic above), so integration LOC is small but does add a new
  npm dependency plus an `H.init()` call and `H.consumeError()`/`console.*` calls at the same
  status-transition points from §0 — still no collector process, satisfying the "no new service to
  operate" constraint even though it's SDK-first rather than HTTP-first in the vendor's own
  guidance.
- **Dedup / latest-per-key query capability — the core question**: **not confirmed, and no
  first-party dedup feature was found for logs.** Highlight.io's log search docs describe filtering
  by message/attributes and default-key search behavior, with no aggregation, grouping, or
  most-recent-per-key retrieval functions documented.
  [highlight.io/docs/general/product-features/logging/log-search](https://www.highlight.io/docs/general/product-features/logging/log-search)
  — supports that the documented log-search feature set is filter/search-oriented, not
  aggregation/dedup-oriented. This is the weakest confirmation of the "current counts by status"
  capability among the primary telemetry-shaped options surveyed (Axiom, Honeycomb, New Relic,
  Loki) — flagged as an unconfirmed/negative finding rather than an assumption either way, and
  combined with the session-replay-centric fit issue above, this option looks like the least
  natural match for the ticket's specific "current counts by status" use case even before
  weighing free-tier limits.
- **Dashboard access**: no explicit statement of Highlight.io's dashboard auth model (account
  login vs. SSO vs. Basic Auth) was found in the pages fetched in this pass — flagged as an
  **unconfirmed gap**, though every comparable hosted vendor surveyed here uses account-login-based
  access, so it would be a reasonable assumption but is not independently confirmed for
  Highlight.io specifically the way it is for the other five options.

## 5. New Relic

- **Free tier**: New Relic's "free forever" tier is confirmed via its own pricing page — "100 GB
  of free data ingest per month," "One free full platform user" plus "Unlimited basic users" at no
  cost, "Default data retention of at least 8 days," "500 synthetic checks," and explicitly "No
  credit card required" to sign up. The page also documents the overage behavior: "When your
  account is within 85% of exceeding your monthly 100 GB of free data ingest, you'll receive an
  email." [newrelic.com/pricing](https://newrelic.com/pricing) — supports every figure and quote
  above, including the "no credit card required" language the ticket specifically asked to
  confirm.
- **Integration effort**: plain HTTP POST to New Relic's Log API is documented as fully sufficient
  — no SDK or agent required. `POST https://log-api.newrelic.com/log/v1` (region-specific
  endpoints exist for EU/Japan/FedRAMP) with an `Api-Key` header carrying the license key and a
  JSON body (`{"timestamp": ..., "message": ..., "logtype": ..., "service": ...}`), up to 1 MB per
  POST, gzip supported. "You can use our Log API to send log data directly to New Relic via an
  HTTP endpoint."
  [docs.newrelic.com/docs/logs/log-api/introduction-log-api/](https://docs.newrelic.com/docs/logs/log-api/introduction-log-api/)
  — supports the endpoint URLs, auth header, payload shape, and size limit. For both task-manager
  and personal-assistant this is a `fetch()` call at each status-transition point from §0, no new
  dependency required — New Relic does also offer full APM agents for Node.js, but those are for
  deeper instrumentation (traces/metrics/profiling) and are explicitly not required just to emit
  structured log events.
- **Dedup / latest-per-key query capability — the core question**: **confirmed supported, and the
  most directly documented of any option surveyed.** NRQL has a first-class `latest()` function:
  "Use the `latest()` function to return the most recent value for an attribute over a specified
  time range... If used in conjunction with a `FACET` it will return the most recent value for an
  attribute for each of the resulting facets," with New Relic's own worked example being
  functionally identical in shape to this ticket's use case — `SELECT latest(countryCode) FROM
  PageView FACET userAgentName` ("returns the most recent country code per each user agent from
  the `PageView` event").
  [docs.newrelic.com/docs/nrql/nrql-syntax-clauses-functions/](https://docs.newrelic.com/docs/nrql/nrql-syntax-clauses-functions/)
  — supports the function definition, FACET behavior, and the analogous worked example. Applied
  here: `SELECT latest(status) FROM EmailEvent FACET emailId` would return each email's current
  status directly, and `SELECT count(*) FROM EmailEvent FACET latest(status)`-style composition (or
  a two-step query) would give the "current counts by status" snapshot the ticket asks for, without
  double-counting transitions — this is the clearest, most explicitly-vendor-documented answer to
  the ticket's core question among all six options surveyed.
- **Dashboard access**: gated by New Relic account login — username/password or SAML SSO via an
  identity provider (Okta, Azure/Entra, OneLogin all have dedicated SCIM/SSO setup docs), managed
  through "authentication domains" and role/group-based access grants; New Relic also supports
  social login (Google, Google Workspace, GitHub, Bitbucket) as an account-login variant.
  `[via WebSearch snippet of docs.newrelic.com login/SSO pages]` — supports the login-options
  description and identity-provider list. No raw HTTP Basic Auth option was found. Same tension
  with map #294's Basic-Auth preference as every other hosted vendor here.

## 6. Grafana Cloud Logs (Loki) — the additional option, chosen as the logs-only angle distinct from #295's metrics framing

#295 already covered Grafana Cloud's free tier in the context of Grafana-as-a-dashboard
(metrics/Prometheus-shaped), flagging it as "in tension with the map's own exclusion" of
Prometheus/Grafana-class stacks. This ticket asks specifically about the **logs product** (Loki)
on its own limits, since a logs-shaped free tier and integration path is a different, and
potentially better, fit for "emit structured events" than a metrics `remote_write` exporter would
be — surveyed here on those separate terms.

- **Free tier (logs-specific, distinct from the metrics limits #295 cited)**: Grafana Cloud's free
  tier for Logs is "Limited to 50 GB ingested per month" with "14 day retention" and "No credit
  card required." [grafana.com/pricing](https://grafana.com/pricing/) — supports all three figures,
  confirmed as a distinct line item from the metrics free-tier limits (10k active series/14-day
  retention) #295 already cited from the same page.
- **Integration effort — and the collector/agent question flagged explicitly**: Loki's own HTTP
  API supports direct log ingestion via a plain `POST /loki/api/v1/push` with a JSON body shaped
  as `{"streams": [{"stream": {<labels>}, "values": [["<unix ns timestamp>", "<log line>"]]}]}` —
  "This enables applications to push logs directly to Loki without deploying Promtail or Grafana
  Alloy as intermediaries."
  [grafana.com/docs/loki/latest/reference/loki-http-api/](https://grafana.com/docs/loki/latest/reference/loki-http-api/)
  — supports the endpoint path, payload shape, and the explicit statement that Promtail/Alloy are
  not required for this path. This is a meaningful, ticket-relevant finding: Grafana's own
  marketing and most tutorials assume Promtail or Grafana Alloy (a locally-run log-shipping
  collector/agent) sits in front of Loki, which **would** conflict with the "no new service to
  operate" constraint — but the underlying push API itself is documented as directly reachable via
  plain HTTP from an application, same shape as Axiom/Better Stack/New Relic above, if the
  integration is built by hand against that endpoint rather than by installing Promtail/Alloy. No
  official first-party Node.js SDK specifically for the Loki push API (as distinct from the
  broader Grafana/OpenTelemetry ecosystem) was found in this pass — a hand-rolled `fetch()` POST
  against the documented endpoint shape is the integration path, on the order of the same small
  amount of code as the raw-HTTP options above.
- **Dedup / latest-per-key query capability — the core question**: **not confirmed, and flagged as
  a negative finding.** LogQL's log-query documentation covers stream selectors, line filters,
  label filters, and parser expressions (JSON, logfmt, pattern, regexp, unpack) plus label-format/
  drop/keep expressions — no function for "latest log line per label" or general deduplication was
  found in the fetched reference; `unwrap` (used to extract a numeric value from a log line for
  range-vector metric queries) is mentioned only in a limited label-filter-ordering context, not as
  a dedup mechanism. [grafana.com/docs/loki/latest/query/log_queries/](https://grafana.com/docs/loki/latest/query/log_queries/)
  — supports the covered expression types and the absence of a documented latest-per-key/dedup
  function among them. This mirrors Honeycomb's and Highlight.io's negative findings above; Loki's
  query model, like theirs, appears oriented around filtering/searching the append-only log stream
  rather than collapsing it to one row per key, and — unlike Better Stack's ClickHouse-SQL-based
  underlying engine, where a generic dedup pattern is at least inferable from the engine's own
  general capabilities even if not vendor-documented for this product — no such inferable
  underlying mechanism was identified for LogQL in this pass either. Getting "current counts by
  status" out of Loki as surveyed here would likely require either restructuring what gets emitted
  (e.g. only ever pushing the current state as a fresh log line and querying the most recent
  matching line per stream/label combination via LogQL's `| json | line_format` type tooling, not
  independently verified here) or accepting the double-counting risk the ticket flags.
- **Dashboard access**: Grafana Cloud dashboard access is gated by Grafana account login, with
  SSO/SAML available for Grafana Cloud orgs — "If you're a Grafana Cloud user, you don't have
  access to the Grafana configuration file, so you should configure SAML through other methods,"
  implying SSO is configured through Grafana Cloud's own hosted settings rather than a
  self-managed `grafana.ini`. `[via WebSearch snippet of grafana.com/docs authentication pages]` —
  supports the SSO-via-hosted-settings framing. No raw Basic Auth option for the dashboard itself
  was found (distinct from #295's note that Dokku's own `dokku-http-auth` plugin could front a
  *self-hosted* option — Grafana Cloud here is the hosted product, so that specific workaround
  doesn't apply the same way). Same tension with map #294's Basic-Auth preference as the rest.

---

## Comparison summary

| Option | Free tier confirmed genuine? | SDK vs plain HTTP | Backend agent/collector needed? | Latest-per-key / dedup query support | Dashboard auth (vendor login vs Basic Auth) | Notes |
|---|---|---|---|---|---|---|
| Axiom | Yes — "Permanent. No credit card required," 500 GB/mo, 30-day retention | Plain HTTP POST documented as primary path; optional JS/Pino/Winston integrations | No | **Confirmed** — `arg_max` aggregation in APL | Vendor account login + optional SAML SSO/SCIM | Clearest HTTP-first integration story alongside New Relic |
| Honeycomb | Yes — "free forever," 20M events/mo (retention/credit-card unconfirmed in this pass) | Plain HTTP (Events API) or official `libhoney` npm package | No | **Not confirmed / negative finding** — no "row at max" function in the documented aggregation list | Vendor account login; SAML SSO gated to Pro/Enterprise plans | `MAX()` returns a value, not a row — dedup path unclear |
| Better Stack (Telemetry/Logs) | Likely yes — $0/mo tier with concrete limits; explicit "no card"/"free forever" wording not found on the fetched page itself (minor gap) | Plain HTTP POST documented; official `@logtail/node` SDK (legacy name, active product) | No | **Inferred, not vendor-documented** — underlying ClickHouse SQL supports `argMax`, but Better Stack's own docs page fetched here doesn't demonstrate it | Vendor account login + SSO (Google SAML, Okta/SCIM, others) | Formerly Logtail, now merged into Better Stack branding; client libs still `@logtail/*`-named |
| Highlight.io | Yes — "Free Forever," concrete session/error/log/trace limits (credit-card language unconfirmed) | Official `@highlight-run/node` SDK is the documented path, not raw HTTP | No | **Not confirmed** — log search docs are filter-oriented, no dedup/aggregation function found | Not confirmed in this pass (unconfirmed gap) | Primarily a frontend session-replay + error-monitoring tool; weakest fit for this ticket's "current counts by status" use case |
| New Relic | Yes — "free forever," 100 GB/mo, "No credit card required" stated explicitly | Plain HTTP POST to Log API documented as fully sufficient, no SDK/agent required | No | **Confirmed, most explicit** — NRQL `latest()` with `FACET`, vendor's own example is analogous to this ticket's use case | Vendor account login (username/password, social login, or SAML SSO) | Strongest documented answer to the core dedup question of all six options |
| Grafana Cloud Logs (Loki) | Yes — 50 GB/mo, 14-day retention, "No credit card required," logs-specific (distinct from #295's metrics figures) | Direct HTTP `POST /loki/api/v1/push` documented as usable *without* Promtail/Alloy | No, if integrated by hand against the push API directly (Promtail/Alloy are the commonly-assumed but not strictly required path) | **Not confirmed / negative finding** — no dedup/latest-per-label function found in LogQL's log-query reference | Grafana Cloud account login + SSO via hosted settings | Distinct logs-only limits from #295's Grafana-as-dashboard/metrics framing; collector-free path exists but is the less-traveled one |

No option is picked here — that's explicitly deferred to the follow-up decision ticket
[#297](https://github.com/ertrzyiks/ertrzyiks.me/issues/297), to be weighed alongside #295's
findings on the read-existing-state-directly shape.

---

## Sources index

- Axiom — pricing page: https://axiom.co/pricing — fetched directly
- Axiom — ingest/send-data docs: https://axiom.co/docs/send-data/ingest — fetched directly
- Axiom — APL introduction: https://axiom.co/docs/apl/introduction — fetched directly
- Axiom — `arg_max` aggregation function reference: https://axiom.co/docs/apl/aggregation-function/arg-max — fetched directly (first-guessed URL `.../aggregation-function/aggregation-function` 404'd; corrected via WebSearch)
- Axiom — account settings/SSO docs: https://axiom.co/docs/reference/settings — fetched directly
- Honeycomb — pricing page: https://honeycomb.io/pricing — fetched directly
- Honeycomb — send-data docs: https://docs.honeycomb.io/send-data/ — fetched directly
- Honeycomb — query builder aggregation-function reference: https://docs.honeycomb.io/investigate/query/build — fetched directly (first-guessed URL `.../query/` 404'd; corrected via WebSearch)
- `libhoney` npm package listing/version: https://www.npmjs.com/package/libhoney — via WebSearch snippet (direct `npmjs.com` fetch not attempted here given prior 403s in this sandbox per #295)
- `honeycombio/libhoney-js` GitHub repo: https://github.com/honeycombio/libhoney-js — referenced via WebSearch snippet
- Honeycomb — SSO configuration docs (Google/SAML/Entra): docs.honeycomb.io SSO pages — via WebSearch snippet
- Better Stack — pricing page: https://betterstack.com/pricing — fetched directly
- Better Stack — Logs HTTP REST API docs: https://betterstack.com/docs/logs/http-rest-api/ — fetched directly
- Better Stack — SQL dashboards/queries docs: https://betterstack.com/docs/logs/dashboards/sql-queries/ — fetched directly (first-guessed `.../sql-editor/` URL 404'd; corrected via WebSearch)
- Better Stack — free-tier credit-card-requirement cross-check: various secondary listings — via WebSearch snippet (mixed/inconclusive signal, flagged as a minor gap)
- Logtail → Better Stack rebrand/merge status: press release and `logtail` GitHub org — via WebSearch snippet (https://betterstack.com/press/introducing-better-stack/, https://github.com/logtail)
- `@logtail/node` and related npm package names: npmjs.com listings — via WebSearch snippet
- Better Stack — SSO configuration docs: betterstack.com/docs SSO pages — via WebSearch snippet
- ClickHouse `argMax` general capability (not Better Stack's own docs): via WebSearch snippet of general ClickHouse documentation/blog sources — explicitly flagged in the doc body as an inference, not a Better-Stack-specific citation
- Highlight.io — pricing page: https://highlight.io/pricing — fetched directly
- Highlight.io — Node.js SDK getting-started docs: https://www.highlight.io/docs/getting-started/server/js/nodejs — fetched directly
- Highlight.io — log search docs: https://www.highlight.io/docs/general/product-features/logging/log-search — fetched directly
- Highlight.io — product framing (session replay/error monitoring/logging/tracing): GitHub repo README and YC launch post — via WebSearch snippet (https://github.com/highlight/highlight)
- New Relic — pricing page: https://newrelic.com/pricing — fetched directly
- New Relic — Log API introduction docs: https://docs.newrelic.com/docs/logs/log-api/introduction-log-api/ — fetched directly
- New Relic — NRQL syntax/clauses/functions reference (`latest()`): https://docs.newrelic.com/docs/nrql/nrql-syntax-clauses-functions/ — fetched directly
- New Relic — login options/SSO docs: docs.newrelic.com login and authentication-domains pages — via WebSearch snippet
- Grafana Cloud — pricing page (logs-specific limits): https://grafana.com/pricing/ — fetched directly
- Grafana Loki — HTTP API reference (`/loki/api/v1/push`): https://grafana.com/docs/loki/latest/reference/loki-http-api/ — fetched directly
- Grafana Loki — LogQL log queries reference: https://grafana.com/docs/loki/latest/query/log_queries/ — fetched directly
- Grafana Cloud — authentication/SSO docs: grafana.com/docs authentication pages — via WebSearch snippet
- `apps/personal-assistant/src/store.ts` (`markEmailFailed`/`markEmailCompleted` call sites) — this repo
- `apps/task-manager/src/bullBoard.ts` (existing Fastify/BullMQ integration surface) — this repo
- ertrzyiks/ertrzyiks.me issue #294 (map) — https://github.com/ertrzyiks/ertrzyiks.me/issues/294
- ertrzyiks/ertrzyiks.me issue #295 (sibling research ticket, read-existing-state shape) — https://github.com/ertrzyiks/ertrzyiks.me/issues/295
- `docs/research/dashboard-observability-tools.md` on branch `research/dashboard-observability-tools` (#295's findings document, used as the format/tone reference for this document) — this repo
- ertrzyiks/ertrzyiks.me issue #297 (follow-up decision ticket) — https://github.com/ertrzyiks/ertrzyiks.me/issues/297
- ertrzyiks/ertrzyiks.me issue #299 (this ticket) — https://github.com/ertrzyiks/ertrzyiks.me/issues/299
