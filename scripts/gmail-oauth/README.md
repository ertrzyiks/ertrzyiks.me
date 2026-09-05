# Gmail OAuth bootstrap

One-time script for [#247](https://github.com/ertrzyiks/ertrzyiks.me/issues/247). Produces the
single `gmail.readonly` refresh token shared by `personal-assistant` (orchestration) and
`task-manager`'s `extract-action-items` worker, per the design in #236 — both run in the cloud
today (`task-manager`'s worker used to be a Mac-only LaunchAgent, see that package's README's
"Email action-item extraction" section for what changed).

Run this locally on your Mac, not in CI or any sandbox — it needs a real browser for the consent
screen and its output is a live credential.

## 1. Create the Google Cloud OAuth client (manual, your side)

1. Create/select a Google Cloud project.
2. Enable the **Gmail API** for it.
3. OAuth consent screen: add yourself as a **test user** (the app stays in "Testing" publishing
   status — `gmail.readonly` is a sensitive scope and full verification isn't worth it for a
   single-user personal tool).
4. Create an OAuth client of type **Desktop app**. Desktop clients accept any
   `http://localhost:<port>/...` redirect URI without pre-registration, which is why this script
   doesn't need you to register a redirect URI up front.
5. Note the generated **Client ID** and **Client secret**.

## 2. Run the script

```bash
cd scripts/gmail-oauth
npm install
GMAIL_OAUTH_CLIENT_ID=<client id> GMAIL_OAUTH_CLIENT_SECRET=<client secret> npm run get-refresh-token
```

It prints a Google consent URL, spins up a temporary localhost server to catch the redirect, and
once you complete consent in the browser it exchanges the code for tokens and prints:

```
GMAIL_OAUTH_CLIENT_ID:     ...
GMAIL_REFRESH_TOKEN:       ...
```

(the client secret isn't echoed back — you already have it, it's the value you passed in). The
refresh token is only ever shown here — Google doesn't let you retrieve it again later. If a
run ever prints "No refresh_token was returned", it means this Google account already consented
for this client before; revoke access at https://myaccount.google.com/permissions and re-run.

## 3. Store the values

**1Password** (vault `Dokku apps`, item names as expected by the Terraform). `personal_assistant_google_oauth_client`
is a **Login** item shared with `scripts/calendar-oauth` (#343) —
if you bootstrapped Calendar first, it already exists; reuse its existing client
id/secret instead of minting a new OAuth client here, since a single OAuth client can hold
refresh tokens for multiple scopes.

| 1Password item                                    | Field      | Value                       |
| ---------------------------------------------------- | ---------- | ---------------------------- |
| `personal_assistant_google_oauth_client`             | `username` | `GMAIL_OAUTH_CLIENT_ID`      |
| `personal_assistant_google_oauth_client`             | `password` | `GMAIL_OAUTH_CLIENT_SECRET`  |
| `personal_assistant_gcloud_oauth_refresh_token`      | `password` | `GMAIL_REFRESH_TOKEN`        |

If `personal_assistant_google_oauth_client` doesn't exist yet, create it as a **Login** item (not
a password item — it needs both a username and a password field). Either create these by hand in
the 1Password app/GUI, or with the `op` CLI, e.g.:

```bash
op item create --category=login --vault="Dokku apps" \
  --title="personal_assistant_google_oauth_client" \
  "username=<GMAIL_OAUTH_CLIENT_ID value>" "password=<GMAIL_OAUTH_CLIENT_SECRET value>"

op item create --category=password --vault="Dokku apps" \
  --title="personal_assistant_gcloud_oauth_refresh_token" \
  "password=<GMAIL_REFRESH_TOKEN value>"
```

**`task-manager`'s own deploy config** (Terraform, see `terraform/main.tf`'s `dokku_app.task_manager`
`GMAIL_REFRESH_TOKEN` — sourced from the same `personal_assistant_gcloud_oauth_refresh_token`
1Password item above, not a separate copy). `task-manager`'s `extract-action-items` worker used to
read this from the macOS Keychain instead, back when it ran as a Mac-only LaunchAgent (#251,
removed) — it's a plain env var now, same as everywhere else this service reads a credential.

## Notes

- This is the same refresh token in both places — one shared `gmail.readonly` credential per the
  decision in #236, not two separate ones.
- This script and its `node_modules` are not part of the `apps/*` pnpm workspace and are not
  deployed anywhere; it's a throwaway bootstrap tool.
