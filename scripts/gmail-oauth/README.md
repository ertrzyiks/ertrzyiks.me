# Gmail OAuth bootstrap

One-time script for [#247](https://github.com/ertrzyiks/ertrzyiks.me/issues/247). Produces the
single `gmail.readonly` refresh token shared by `personal-assistant` (orchestration, cloud) and
the `task-manager` Mac worker, per the design in #236.

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

**1Password** (vault `Dokku apps`, item names as expected by the Terraform in #252):

| 1Password item                                    | Value                       |
| ---------------------------------------------------- | ---------------------------- |
| `personal_assistant_gcloud_oauth_client_id`          | `GMAIL_OAUTH_CLIENT_ID`      |
| `personal_assistant_gcloud_oauth_client_secret`      | `GMAIL_OAUTH_CLIENT_SECRET`  |
| `personal_assistant_gcloud_oauth_refresh_token`      | `GMAIL_REFRESH_TOKEN`        |

Either create these by hand in the 1Password app/GUI, or with the `op` CLI if you have it set up, e.g.:

```bash
op item create --category=password --vault="Dokku apps" \
  --title="personal_assistant_gcloud_oauth_refresh_token" \
  "password=<GMAIL_REFRESH_TOKEN value>"
```
(repeat for the other two items)

**macOS Keychain** (read by the Mac worker at startup — implemented in #251, this just captures
the secret now while you have it):

```bash
security add-generic-password \
  -a "$USER" \
  -s "task-manager-gmail-refresh-token" \
  -w "<GMAIL_REFRESH_TOKEN value>"
```

The service name above (`task-manager-gmail-refresh-token`) is provisional — #251 owns the actual
Keychain read implementation and can rename it there if it picks a different convention.

## Notes

- This is the same refresh token in both places — one shared `gmail.readonly` credential per the
  decision in #236, not two separate ones.
- This script and its `node_modules` are not part of the `apps/*` pnpm workspace and are not
  deployed anywhere; it's a throwaway bootstrap tool.
