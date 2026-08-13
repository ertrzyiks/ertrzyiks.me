# kstatus

Manually managed status page. There's no automated incident detection — an admin records a
`warning` or `downtime` by hand through the admin UI, and the public status page renders whatever
has been recorded, grouped by day.

## Event types

- **warning** — a single-time event (one timestamp), rendered in yellow.
- **downtime** — a start time and an optional end time, rendered in red. Leaving the end time
  blank marks it as still ongoing; editing it later to set an end time closes it out.

Every event also carries a **day part** — morning (00:00–10:59), afternoon (11:00–16:59), or
evening (17:00–23:59) — derived from its start time (`src/dayPart.ts`). It's not currently shown
in the UI (dropped in favor of just the title + time), but stays available as domain vocabulary
for future use (e.g. filtering).

Timestamps are stored exactly as typed into an `<input type="datetime-local">`
("`YYYY-MM-DDTHH:mm`", no timezone attached) and are never reinterpreted through `Date`/timezone
conversion anywhere in this app (see `src/dayPart.ts`) — they're wall-clock text, meaningful only
as "what the clock read when the admin entered it," consistently redisplayed the same way.

## Pages

- **`GET /`** — the public status page. Shows a 14-day history bar at the top (green = no
  incidents, yellow = a warning happened that day, red = a downtime covered that day — red wins
  if a day had both; see `src/dayBar.ts`), followed by a day-by-day stream covering that same
  14-day window (newest day first, see `eventStreamHtml` in `src/views.ts`) — every day gets a
  heading, and a day with nothing recorded shows a "No events, all good." placeholder instead of
  being skipped. No authentication.
- **`GET /admin`** — the admin page. Shows events from the last 2 days (plus any still-open
  downtime regardless of age, so it's never impossible to close one out — see
  `Store.listAdminEvents`), an "Add event" form, and an **Edit** link and a **Remove** button per
  event.
- **`GET /admin/events/:id/edit`** — edit form for a single event, prefilled with its current
  values.
- **`POST /admin/events/:id/delete`** — deletes a single event (confirmed client-side before
  submitting) and redirects back to `/admin`. 404s if the id doesn't exist.

## Admin authentication

`/admin` (and everything under it) is guarded by HTTP Basic Auth, but **only when both**
`KSTATUS_ADMIN_BASIC_AUTH_USERNAME` and `KSTATUS_ADMIN_BASIC_AUTH_PASSWORD` are set. In production
(Dokku) both are always provisioned via Terraform (see `terraform/main.tf`'s `dokku_app.kstatus`),
so the guard is always active there. Locally, both are left unset by default (see
`.env.example`), so `/admin` is reachable with no auth prompt at all — set both in `.env` if you
want to exercise the Basic Auth flow during development.

## Environment variables

| Variable                             | Required | Description                                                                 |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| `DATABASE_PATH`                       | no       | Path to the SQLite file (default `/app/data/kstatus.sqlite`, matching the `storage` mount in `terraform/main.tf`'s `dokku_app.kstatus`) |
| `PORT`                                | no       | HTTP port to listen on (default `3000`)                                       |
| `KSTATUS_ADMIN_BASIC_AUTH_USERNAME`   | no\*     | Basic Auth username for `/admin`                                              |
| `KSTATUS_ADMIN_BASIC_AUTH_PASSWORD`   | no\*     | Basic Auth password for `/admin`                                              |

\* Must be set together or left unset together — setting only one throws on startup
(`loadConfig`).

## SQLite schema

Created at startup if missing:

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('warning', 'downtime')),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## Development

```bash
pnpm install
pnpm --filter kstatus test
```

### Local dev workflow

1. Copy the env file:

   ```bash
   cp apps/kstatus/.env.example apps/kstatus/.env
   ```

2. Run the dev server:

   ```bash
   pnpm --filter kstatus dev
   ```

   This runs `src/devServer.ts`, which loads `apps/kstatus/.env` (via `dotenv`) before delegating
   to the same wiring the production entrypoint uses. The production entrypoint (`src/server.ts`,
   what Dokku runs via `pnpm start`) never depends on `dotenv`.

3. Open **http://localhost:3000** for the public status page and
   **http://localhost:3000/admin** for the admin page.

## Design notes

- Server-rendered HTML via plain template strings (`src/views.ts`) — no client-side framework, no
  frontend build step. All user-supplied text is escaped (`escapeHtml`) before being interpolated.
- `src/store.ts` uses Node's built-in `node:sqlite`, matching the pattern in
  `apps/personal-assistant/src/store.ts`.
- `Store.listAdminEvents`'s "last 2 days" cutoff is computed from a `now` the caller supplies
  (`src/app.ts`'s `createApp(store, adminBasicAuth, now)`), so tests don't depend on the real
  clock.
