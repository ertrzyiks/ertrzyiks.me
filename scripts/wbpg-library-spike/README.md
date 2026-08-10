# WBPG library login spike

Feasibility spike for a future task-manager job: can we log into the WBPG library catalog
(https://katalog.wbpg.org.pl/, a MOL "Solar" OPAC) with a login/password, capture its session
cookie, and call a couple of authenticated endpoints with it?

This is throwaway — not part of the `apps/*` pnpm workspace, not deployed anywhere, no
dependencies (uses Node's built-in `fetch`). If the job gets built for real it belongs in
`apps/task-manager` following the `gmail.ts`/`jobProcessor.ts` seam pattern, not here.

## What was found

The site has no public API docs. The endpoints and payload shapes below came from grepping the
OPAC's own Angular bundle (`main-es2015.*.js`, `AuthService`/`SearchService` classes) for
`"/api/"`:

- `POST /api/login` — body `{ username, password }`. The site already sets an anonymous
  `SESSION` cookie on the very first `GET /`; a successful login upgrades that *same* cookie to
  an authenticated one rather than issuing a new one. Failure returns `401` with
  `{ success: false, i18nMsg: { key: "bad_credencials" } }` (confirmed against the real server —
  see below).
- `GET /api/auth/profile` — user profile, cookie-authenticated.
- `POST /api/auth/userinfo` — despite the name, not a `GET`: body `{ chromePwa }` (`false` on the
  normal, non-PWA-install code path). Returns the fuller `userInfo` object the SPA keeps in its
  global state (loan/reservation/message counts, `canOrder`/`canRenew`/... permission flags,
  `subusers` boolean, etc. — see the constructor-default dump in the bundle for the full field
  list).
- `GET /api/auth/setting/user/accountSetting` — account settings, `{ success, data }` where
  `data` is a JSON-*encoded string* (`UserService.getSetting("accountSetting")` does
  `JSON.parse(e.data)` on the result — it's not returned as a nested object directly).
- `GET /api/auth/setting/user/account` — a single setting (`{ success, data }`, `data` here is
  just a plain value, e.g. the app reads it as `Number(e.data)` for the account's avatar id — not
  JSON-encoded like `accountSetting` above). `/api/auth/setting/user/<key>` looks like a generic
  per-key settings read; only these two keys have been tried.
- `POST /api/auth/loan` — current loans, body `{ start, count, status }` (paging + optional
  status filter; `{ start: 0, count: 50, status: null }` gets everything up to 50).
- `GET /api/auth/user/subusers` — list of accounts linked to the logged-in login (e.g. a child's
  card linked to a parent's), `{ success, start, total, data: [{ key, username, fullName }, ...] }`
  (confirmed against the real server, one linked account).
- `POST /api/auth/user/change` — body `{ key }`, switches the logged-in session's active account
  to one of those linked accounts. Swaps the session in place, same cookie — every request after
  this (e.g. the next `/api/auth/loan` call) acts on that account until switched back or the
  session ends.
- Also present in the bundle but not called by the spike: `/api/auth/loanArchived` (loan
  history), `/api/auth/renewal` (extend a loan, `{ holdingId }`), `/api/auth/reservation/cancel`,
  `/api/auth/reservation`.

## What's verified

Run against a real WBPG account: login succeeds, `POST /api/auth/loan` returns that account's
real loans, `GET /api/auth/user/subusers` lists linked accounts, and `POST
/api/auth/user/change` with one of those keys switches the session — a follow-up `POST
/api/auth/loan` correctly returns a *different* set of loans (the linked account's, not the
parent's), confirming the switch actually changes which account subsequent calls act on.

`GET /api/auth/user/subusers` initially came back `403 { success: false }` from this script, even
with a valid cookie. Two theories got ruled out in order:

1. **Missing browser-like headers** — an earlier version of this script sent a full set of
   headers copied from a real Chrome request (`Origin`, `User-Agent`, `Sec-Fetch-*`,
   `Sec-CH-UA*`) to chase this. Confirmed against the real server: **`Cookie` is the only header
   any of these endpoints actually needs** — that wasn't it.
2. **Confirmed actual cause: call sequence.** The real SPA always calls `POST /api/auth/userinfo`
   right after login before anything else — this script wasn't. Adding that call earlier in the
   sequence (see `spike.mjs`) fixed the `subusers` 403. Most likely explanation: the server
   populates some auth/permission state into the session as a side effect of `userinfo`, and
   `subusers` (and maybe other endpoints) depend on that state existing — i.e. this API expects
   callers to follow roughly the same call order the SPA does, not just present a valid cookie.

Practical takeaway for the eventual task-manager job: call `/api/auth/userinfo` once right after
login and before anything else, every time — don't assume a valid session cookie alone is
sufficient for every endpoint.

Not exercised: `/api/auth/reservation`, and switching back to the parent account
(`/api/auth/user/change` presumably takes the parent's own key too, unconfirmed).

## Usage

```bash
WBPG_USERNAME=<library card number or login> WBPG_PASSWORD=<password> node scripts/wbpg-library-spike/spike.mjs
```

Prints the status + body of each request it makes, in order: `POST /api/login`, `POST
/api/auth/userinfo` (must run before the rest — see above), `GET /api/auth/profile`, `GET
/api/auth/setting/user/accountSetting`, `GET /api/auth/setting/user/account`, `POST
/api/auth/loan` (own loans), `GET /api/auth/user/subusers`, then for every linked account found,
`POST /api/auth/user/change` followed by that account's `POST /api/auth/loan`. No extra env vars
or flags needed — the sub-account keys are discovered from the API, not supplied by hand.
