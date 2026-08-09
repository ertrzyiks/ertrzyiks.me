# Google Tasks OAuth bootstrap

One-time script that produces the `tasks` refresh token the `task-manager` Jobs API server uses
to run the `sync-google-tasks` worker (see `apps/task-manager/src/googleTasksClient.ts`). Mirrors
[`scripts/gmail-oauth`](../gmail-oauth/README.md)'s shape, for a different scope and a different
consumer — this credential is read from **env vars on Dokku** (`GOOGLE_TASKS_*`), not the Mac
Keychain, since the worker it feeds runs in the cloud alongside the Jobs API server, not on the
Mac.

Run this locally, not in CI or any sandbox — it needs a real browser for the consent screen and
its output is a live credential.

## 1. Create (or reuse) the Google Cloud OAuth client

1. Enable the **Google Tasks API** on the same Google Cloud project used for
   `scripts/gmail-oauth` (or a different one — the client id/secret aren't scope-bound).
2. You can reuse the existing **Desktop app** OAuth client from `scripts/gmail-oauth` as-is — a
   single OAuth client can mint refresh tokens for multiple distinct scopes, and this script asks
   for its own `tasks` scope independently of the `gmail.readonly` one. A separate client works
   too if you'd rather keep the credentials fully apart.
3. Note the **Client ID** and **Client secret**.

## 2. Run the script

```bash
cd scripts/google-tasks-oauth
npm install
GOOGLE_TASKS_OAUTH_CLIENT_ID=<client id> GOOGLE_TASKS_OAUTH_CLIENT_SECRET=<client secret> npm run get-refresh-token
```

It prints a Google consent URL, spins up a temporary localhost server to catch the redirect, and
once you complete consent in the browser it exchanges the code for tokens and prints:

```
GOOGLE_TASKS_OAUTH_CLIENT_ID:     ...
GOOGLE_TASKS_REFRESH_TOKEN:       ...
```

(the client secret isn't echoed back — you already have it). The refresh token is only ever shown
here — Google doesn't let you retrieve it again later. If a run ever prints "No refresh_token was
returned", this Google account already consented to this client for the `tasks` scope before;
revoke access at https://myaccount.google.com/permissions and re-run.

## 3. Store the values

**1Password** (vault `Dokku apps`, item names matching the Terraform `onepassword_item` data
sources in `terraform/data.tf`):

| 1Password item                                       | Value                              |
| ------------------------------------------------------ | ------------------------------------ |
| `task_manager_google_tasks_oauth_client_id`            | `GOOGLE_TASKS_OAUTH_CLIENT_ID`       |
| `task_manager_google_tasks_oauth_client_secret`        | `GOOGLE_TASKS_OAUTH_CLIENT_SECRET`   |
| `task_manager_google_tasks_oauth_refresh_token`        | `GOOGLE_TASKS_REFRESH_TOKEN`         |

Either create these by hand in the 1Password app/GUI, or with the `op` CLI, e.g.:

```bash
op item create --category=password --vault="Dokku apps" \
  --title="task_manager_google_tasks_oauth_refresh_token" \
  "password=<GOOGLE_TASKS_REFRESH_TOKEN value>"
```
(repeat for the other two items)

Once all three exist, `terraform apply` will pick them up via the `dokku_app.task_manager`
resource in `terraform/main.tf` and provision them as `GOOGLE_TASKS_CLIENT_ID` /
`GOOGLE_TASKS_CLIENT_SECRET` / `GOOGLE_TASKS_REFRESH_TOKEN` on Dokku — until then, `terraform
apply` fails on the missing 1Password items, and the deployed `sync-google-tasks` worker stays
unstarted (see `apps/task-manager/README.md`'s "Google Tasks sync" section).

## Notes

- This script and its `node_modules` are not part of the `apps/*` pnpm workspace and are not
  deployed anywhere; it's a throwaway bootstrap tool, same as `scripts/gmail-oauth`.
