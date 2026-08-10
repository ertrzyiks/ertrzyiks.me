// Throwaway feasibility spike for a future task-manager job: log into the WBPG library
// catalog (https://katalog.wbpg.org.pl/, a MOL "Solar" OPAC), capture its session cookie,
// and call a couple of authenticated endpoints with it. Nothing here is wired into
// task-manager yet — this only proves the login + cookie + endpoint flow works before that
// job gets built for real (env-based secrets, retries, a proper HTTP client, etc.).
//
// Endpoints below were found by grepping the OPAC's own Angular bundle
// (main-es2015.*.js) for "/api/" — see AuthService.login/getUserProfile/getLoans/
// getReservations in that bundle. No API docs exist for this product; that bundle is the
// closest thing to a source of truth.
//
// Usage:
//   WBPG_USERNAME=<login> WBPG_PASSWORD=<password> node scripts/wbpg-library-spike/spike.mjs
//
// After logging in, this fetches the account's own profile and loans, then calls GET
// /api/auth/user/subusers (linked accounts, e.g. a child's card) and, for each one found,
// switches into it with POST /api/auth/user/change {key} and fetches its loans too —
// same cookie throughout, the switch just swaps which account it acts on.

const BASE_URL = "https://katalog.wbpg.org.pl";

const username = process.env.WBPG_USERNAME;
const password = process.env.WBPG_PASSWORD;

if (!username || !password) {
  console.error(
    "Missing credentials. Set WBPG_USERNAME and WBPG_PASSWORD and re-run.",
  );
  process.exit(1);
}

// Minimal cookie jar: the OPAC issues a SESSION cookie on the very first request
// (anonymous) and upgrades that *same* cookie to an authenticated one on a successful
// POST /api/login — it's not a fresh token, so every request has to keep sending
// whatever the most recent Set-Cookie handed back.
const jar = new Map();

function storeCookies(res) {
  // getSetCookie() (Node 20+) returns each Set-Cookie header separately; a plain
  // res.headers.get("set-cookie") would collapse multiple into one comma-joined string.
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(method, path, body) {
  const cookie = cookieHeader();
  // Printed so a 403/401 can be told apart from "we forgot to send the cookie" at a
  // glance, instead of having to trust the code that builds the header.
  console.log(`--> ${method} ${path} | Cookie: ${cookie || "(none)"}`);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    // Confirmed against the real server: the Cookie is the only header any of these
    // endpoints actually need. An earlier version of this script also sent a full set of
    // browser-mimicking headers (Origin, User-Agent, Sec-Fetch-*, ...) to chase a 403 that
    // turned out not to be caused by their absence — see git history / README if that
    // theory needs resurrecting.
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

function report(label, result) {
  console.log(`\n=== ${label} ===`);
  console.log(`status: ${result.status}`);
  console.log(JSON.stringify(result.body, null, 2));
}

function getLoans() {
  return request("POST", "/api/auth/loan", {
    start: 0,
    count: 50,
    status: null,
  });
}

// 2. Log in. On success this upgrades the existing SESSION cookie to an authenticated one
// (no new cookie value to swap in by hand — storeCookies() above already overwrote it).
const login = await request("POST", "/api/login", { username, password });
report("POST /api/login", login);

if (login.status !== 200) {
  console.error(
    "\nLogin failed, stopping before calling authenticated endpoints.",
  );
  process.exit(1);
}

// Not a GET despite the name: AuthService.getUserInfo() posts { chromePwa } (false in the
// browser's normal, non-PWA-install code path). Called first, right after login, matching
// what the real SPA does — some other endpoints (e.g. /api/auth/user/subusers below) 403
// without this call having run first, even with a valid session cookie. Looks like it seeds
// some auth/permission state into the session as a side effect, not just a data fetch.
report(
  "POST /api/auth/userinfo",
  await request("POST", "/api/auth/userinfo", { chromePwa: false }),
);

report("POST /api/auth/loan (own loans)", await getLoans());

const subusers = await request("GET", "/api/auth/user/subusers");
report("GET /api/auth/user/subusers", subusers);

const subuserLst =
  subusers.status === 200 && subusers.body?.success
    ? (subusers.body.data ?? [])
    : [];

for (const subuser of subuserLst) {
  const label =
    subuser.fullName ?? subuser.name ?? subuser.username ?? subuser.key;

  const change = await request("POST", "/api/auth/user/change", {
    key: subuser.key,
  });
  report(`POST /api/auth/user/change (switch to "${label}")`, change);

  if (change.status !== 200) {
    console.error(`\nSwitching to "${label}" failed, skipping their loans.`);
    continue;
  }

  report(`POST /api/auth/loan (loans for "${label}")`, await getLoans());
}
