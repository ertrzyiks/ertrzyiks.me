# Google Calendar OAuth bootstrap

One-time script for the library-loan -> Google Calendar sync worker
(`apps/task-manager/src/librarySyncWorker.ts`). Produces the `calendar.events` refresh token that
worker uses to create/update/delete events (see `apps/task-manager/src/googleCalendar.ts`).

Run this locally, not in CI or any sandbox — it needs a real browser for the consent screen and
its output is a live credential.

This produces a **separate refresh token from the existing Gmail one** (`scripts/gmail-oauth/`).
Google refresh tokens are scoped to whatever was granted at consent time, and the existing Gmail
token was only ever consented for `gmail.readonly` — it doesn't carry Calendar access, and
re-consenting it would mean redoing that integration's bootstrap too. The OAuth **client**
id/secret, however, are shared across all three flows (gmail, tasks, calendar) via the
`google_oauth_client` 1Password item (#343) — only the refresh tokens are kept independent.

## 1. Create (or reuse) the Google Cloud OAuth client

1. Create/select a Google Cloud project (reusing the same one as `scripts/gmail-oauth/` is fine).
2. Enable the **Google Calendar API** for it.
3. Reuse the existing **Desktop app** OAuth client from `scripts/gmail-oauth`/`scripts/google-tasks-oauth`
   — its id/secret are stored in the shared `google_oauth_client` 1Password item (#343). If that
   item doesn't exist yet (this is the first of the three OAuth bootstraps you're running), create
   a new one instead:
   - OAuth consent screen: add yourself as a **test user** (stays in "Testing" publishing status —
     this is a single-user personal tool, not worth full verification).
   - Create an OAuth client of type **Desktop app**. Desktop clients accept any
     `http://localhost:<port>/...` redirect URI without pre-registration, which is why this
     script doesn't need you to register a redirect URI up front.
   - Note the generated **Client ID** and **Client secret**.

## 2. Run the script

```bash
cd scripts/calendar-oauth
npm install
GOOGLE_CALENDAR_OAUTH_CLIENT_ID=<client id> GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET=<client secret> \
  npm run get-refresh-token
```

It prints a Google consent URL, spins up a temporary localhost server to catch the redirect, and
once you complete consent in the browser it exchanges the code for tokens and prints:

```
GOOGLE_CALENDAR_CLIENT_ID:     ...
GOOGLE_CALENDAR_REFRESH_TOKEN: ...
```

(the client secret isn't echoed back — you already have it, it's the value you passed in). The
refresh token is only ever shown here — Google doesn't let you retrieve it again later. If a run
ever prints "No refresh_token was returned", it means this Google account already consented for
this client before; revoke access at https://myaccount.google.com/permissions and re-run.

## 3. Store the values

For local dev, add to `apps/task-manager/.env` (see `.env.example`):

```
GOOGLE_CALENDAR_CLIENT_ID=...
GOOGLE_CALENDAR_CLIENT_SECRET=...     # the client secret from step 1, not printed by this script
GOOGLE_CALENDAR_REFRESH_TOKEN=...
```

For production (Dokku), these become `dokku_app.task_manager` config vars in
`terraform/main.tf`, sourced from 1Password — `GOOGLE_CALENDAR_CLIENT_ID`/`_SECRET` from the
shared `google_oauth_client` item (#343, same one used by `scripts/gmail-oauth` and
`scripts/google-tasks-oauth`), `GOOGLE_CALENDAR_REFRESH_TOKEN` from its own
`task_manager_google_calendar_refresh_token` item. See that file's comments and
`apps/task-manager/README.md`'s "Library loan -> Google Calendar sync worker" section for details.

## Notes

- Which calendar the worker writes to is controlled separately, by `GOOGLE_CALENDAR_ID` (defaults
  to `primary` — the calendar of whichever Google account this refresh token belongs to). This
  script doesn't touch that; it only produces the credential that authenticates as that account.
- This script and its `node_modules` are not part of the `apps/*` pnpm workspace and are not
  deployed anywhere; it's a throwaway bootstrap tool.
