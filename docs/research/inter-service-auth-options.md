# Research: securing the Mac worker's Redis connection and the Jobs API's HTTP surface

Ticket: [ertrzyiks/ertrzyiks.me#239](https://github.com/ertrzyiks/ertrzyiks.me/issues/239) (`wayfinder:research`)

Scope recap: a Dokku-hosted **queue service** exposes a Jobs API (backed by BullMQ + an
already-provisioned/hosted Redis instance); a **BullMQ worker** runs on the user's personal Mac and
connects out to that same Redis; a separate Dokku-hosted **orchestration service** calls the queue
service's Jobs API over HTTP. This document only investigates options and their primary-source
basis and cost — it does not choose or recommend one (that belongs to a follow-up ticket, #240).

## A note on sources and access

Per the task, all claims below are traced to primary sources (official docs, source repos, READMEs)
rather than secondary blog summaries. Several primary domains (`docs.bullmq.io`, `tailscale.com`,
`developers.cloudflare.com`, `www.wireguard.com`) returned `403 Blocked by network policy: ... no
matching allow rule — blocked by default deny policy` when fetched directly from this sandbox — this
is the sandbox's own outbound network policy, not a failure on the vendor's side. Where a page could
not be fetched directly, the citation still points at the primary-source URL, and the content was
obtained instead via one of:
- a mirrored raw source that *was* reachable (e.g. `raw.githubusercontent.com` copies of BullMQ's and
  Dokku's own docs repos, and the ioredis README), or
- indexed search-result snippets of the primary page's own text (via WebSearch), quoted below.

This is noted inline wherever it applies, so the origin of each claim is traceable.

---

## 1. How a BullMQ worker authenticates/secures its Redis connection

**BullMQ's own connection docs defer entirely to ioredis.** From BullMQ's docs source
(`docs/gitbook/guide/connections.md` in the `taskforcesh/bullmq` repo, fetched via
`raw.githubusercontent.com` since `docs.bullmq.io` itself was policy-blocked):

> "By default, BullMQ creates connections with ioredis, and the options you pass to BullMQ are
> passed to the ioredis constructor." — [BullMQ `connections.md`](https://docs.bullmq.io/guide/connections) (source: [`taskforcesh/bullmq`](https://github.com/taskforcesh/bullmq/blob/master/docs/gitbook/guide/connections.md))

The `connection` option on `Queue`/`Worker` is passed straight through to `new IORedis(...)`
(confirmed directly in BullMQ's source, `src/classes/redis-connection.ts`: `const ioredisClient = url
? new IORedis(url, rest) : new IORedis(rest);` — [`taskforcesh/bullmq`](https://github.com/taskforcesh/bullmq/blob/master/src/classes/redis-connection.ts)). BullMQ does add one
worker-specific constraint: a `Worker`'s connection **must** have `maxRetriesPerRequest: null` (BullMQ
throws if a manually-created ioredis instance omits it), because blocking commands need indefinite
retry — this is a reliability setting, not a security one.

The BullMQ connections page is silent on TLS, passwords, or ACLs entirely, and says nothing about
whether a worker's Redis connection should be treated as a sufficient trust boundary on its own —
**the topic isn't addressed one way or the other** in BullMQ's own docs; it hands the whole question
to ioredis.

**ioredis (the library BullMQ's `connection` option configures) does support TLS and Redis auth
natively.** From ioredis's own README (`redis/ioredis`, fetched via `raw.githubusercontent.com`):

- Username/password auth (Redis 6+ ACL-style or legacy `requirepass`):
  ```js
  new Redis({ host: "127.0.0.1", username: "default", password: "my-top-secret", db: 0 });
  ```
  or via a connection string: `redis://username:authpassword@127.0.0.1:6380/4`.
  — [ioredis README, "Connect to Redis"](https://github.com/redis/ioredis#readme)
- TLS: "Redis doesn't support TLS natively, however if the redis server you want to connect to is
  hosted behind a TLS proxy ... or is offered by a PaaS service that supports TLS connection (e.g.
  Redis.com), you can set the `tls` option":
  ```js
  const redis = new Redis({ host: "localhost", tls: { ca: fs.readFileSync("cert.pem") } });
  ```
  or a `rediss://` URL, or an empty `tls: {}` for default TLS. ioredis also ships deprecated
  "TLS profiles" (`RedisCloudFixed`, `RedisCloudFlexible`) that pre-fill the CA for Redis Cloud's
  managed offering. — [ioredis README, "TLS Options"](https://github.com/redis/ioredis#tls-options)
- The feature list also states ioredis "Supports Redis ACL" as a top-line capability (item 11 in
  the feature list), and "Supports TLS 🔒" (item 7) — [ioredis README, feature list](https://github.com/redis/ioredis#readme)
- The `tls` object is passed straight to Node's own `tls.connect()`, so `ca`/`cert`/`key`/
  `rejectUnauthorized` are all available, including mutual-TLS-style client certs (`cert`+`key`) if
  the Redis provider supports verifying them — ioredis just forwards the object; Node's own
  [`tls.connect()`](https://nodejs.org/api/tls.html) docs (not fetched separately here, but referenced
  directly by the ioredis README) define what the fields do.

**Whether that connection alone is "enough" to trust a remote worker isn't addressed by either
project's docs.** Both stop at "here's how to configure the connection" and never make a claim about
the resulting trust model for a worker process reachable from an arbitrary machine. That silence is
itself the finding: TLS + password/ACL secures the Redis *transport and authentication*, but nothing
in BullMQ's or ioredis's own documentation asserts that this is sufficient to "trust" whatever process
holds those credentials, nor do they discuss adding a second layer (e.g., restricting which network
paths can reach Redis at all, separate from the app-layer credentials) — that's a deployment decision
left entirely to the operator and the Redis provider (e.g. a managed Redis Cloud/Upstash-style
instance's own IP allowlisting or private networking features, which are out of scope per the ticket
background since the Redis instance is already decided).

---

## 2. Securing the Jobs API's HTTP surface (orchestration service → queue service, cloud-to-cloud)

### 2a. Shared API key or HMAC-signed header over HTTPS

This option isn't a named library/spec with one canonical doc the way BullMQ or Tailscale are — it's
a pattern (a static bearer/API-key header, or an HMAC computed over the request body/timestamp and
sent as a header, both riding on top of HTTPS/TLS for transport confidentiality). No primary-source
fetch was attempted for a specific implementation since the ticket doesn't name one; this option is
noted here for completeness because the issue body names it explicitly as an option to weigh.

### 2b. mTLS (client certificates) — feasibility on Dokku

Checked Dokku's own docs and source repo (`dokku/dokku` on GitHub, fetched both the `docs/` markdown
and a closed feature-request issue):

- Dokku's SSL handling is per-app, via the `certs` plugin: `certs:add` installs a `.crt`/`.key`
  tarball per app, and "SSL is managed via nginx outside of application containers." Dokku's own docs
  do **not** document any native `ssl_client_certificate` / `ssl_verify_client` (mTLS) support — there
  is no built-in plugin surface for verifying client certs.
  — [`dokku/dokku` `docs/configuration/ssl.md`](https://github.com/dokku/dokku/blob/master/docs/configuration/ssl.md)
- This gap is confirmed by an open/closed feature request against Dokku itself:
  [dokku/dokku#4409](https://github.com/dokku/dokku/issues/4409) asks for exactly this — "It would be
  nice to support this with the `certs` plugin. `certs:add-client` could add the required nginx
  config" (motivated by wanting Cloudflare's Authenticated Origin Pulls). The request was
  labeled `type: enhancement` / `needs: more info` and closed without a built-in resolution; the
  requester's workaround was to fight Dokku's automated nginx generation or resort to unused
  self-signed certs.
- Dokku **does** support fully custom nginx config per app via a committed `nginx.conf.sigil`
  template (sigil-templated, validated with `nginx -t` on every deploy unless
  `disable-custom-config` is set), which is the mechanism through which `ssl_client_certificate` /
  `ssl_verify_client` directives *could* be added manually, since Dokku has no first-class flag for
  it. — [`dokku/dokku` `docs/networking/proxies/nginx.md`, "Customizing the nginx configuration"](https://github.com/dokku/dokku/blob/master/docs/networking/proxies/nginx.md)

So: mTLS on a Dokku app is possible but not a supported first-class feature — it requires hand-writing
and maintaining a custom `nginx.conf.sigil` (including keeping it in sync with Dokku's own generated
template across Dokku upgrades), plus separately managing a client-certificate CA/issuance/rotation
process that Dokku has no tooling for at all.

### 2c. Mesh/tunnel approaches (Tailscale, Cloudflare Tunnel, WireGuard)

These could apply either narrowly (securing just the Jobs API HTTP calls) or more broadly (letting
the cloud queue service and the home Mac worker reach each other directly, as an alternative/addition
to the existing Redis-only path).

**Tailscale.** Direct fetch of `tailscale.com/kb/*` was policy-blocked in this sandbox; content below
comes from `github.com/tailscale/tailscale` (the open-source client/daemon repo, fetched directly) plus
indexed snippets of Tailscale's own kb/what-is-tailscale page (via WebSearch, which was not blocked)
that quote the primary source directly:
- Tailscale's own repo describes itself as "the easiest, most secure way to use WireGuard and 2FA" —
  a userspace daemon (`tailscaled`) plus CLI (`tailscale`), with a coordination server used only for
  peer discovery/key exchange, after which devices establish direct encrypted
  peer-to-peer/WireGuard connections. — [`tailscale/tailscale` README](https://github.com/tailscale/tailscale)
- Per Tailscale's own "What is Tailscale?" kb page (quoted via search index since the page itself was
  policy-blocked to fetch directly): it forms a mesh (a "tailnet"), authenticates/authorizes by user
  identity rather than only IP, and is built on WireGuard for the actual data-plane encryption. —
  [Tailscale KB: "What is Tailscale?"](https://tailscale.com/kb/1151/what-is-tailscale)
- Setup, for a solo project, is comparatively light: install the client on the Mac and on the Dokku
  host (or run it as a sidecar/container reachable by the app), sign in with one account, and the two
  nodes can reach each other by Tailscale-assigned name/IP without any port-forwarding or public
  exposure. No CA/cert management of your own — Tailscale's control plane handles key distribution.

**Cloudflare Tunnel.** Direct fetch of `developers.cloudflare.com/cloudflare-one/*` was policy-blocked;
content below is from `github.com/cloudflare/cloudflared` (fetched directly, the open-source tunnel
client) plus the same page fetched by WebSearch-index snippet:
- `cloudflared` is "a tunneling daemon that proxies traffic from the Cloudflare network to your
  origins," with an outbound-only architecture: "your origin can remain as closed as possible" — no
  inbound firewall port needs to be opened on either the Mac or the Dokku host.
  — [`cloudflare/cloudflared` README](https://github.com/cloudflare/cloudflared)
- Cloudflare's own docs (quoted via search snippet) describe the tunnel as connecting infrastructure
  to Cloudflare "through an outbound-only ... encrypted connection," positioned as the connectivity
  layer for Cloudflare One / Zero Trust access policies on top.
  — [Cloudflare Docs: Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- Setup requires a domain onboarded to Cloudflare (nameservers pointed at Cloudflare) plus installing
  `cloudflared` (binary, Docker image, or Homebrew/Debian/RPM package) and authenticating/creating a
  tunnel — this is a real prerequisite if the domain isn't already on Cloudflare, though the daemon
  itself is a single lightweight process, comparable in weight to running the BullMQ worker itself.

**WireGuard.** Direct fetch of `wireguard.com` was policy-blocked; content below is from
`github.com/WireGuard/wireguard-tools` (the userspace tooling repo, fetched directly) plus WireGuard's
own site content quoted via WebSearch snippet:
- WireGuard positions itself as "an extremely simple yet fast and modern VPN," using
  state-of-the-art cryptography (Noise Protocol Framework, Curve25519, ChaCha20, Poly1305), aiming to
  be simpler and leaner than IPsec and faster than OpenVPN.
  — [wireguard.com](https://www.wireguard.com/)
- The `wireguard-tools` repo supplies `wg(8)` (core config utility) and `wg-quick(8)` (a bash
  convenience script that reads a config file and brings up the interface); building requires "only a
  good C compiler and a sane libc" — no heavyweight dependency chain. — [`WireGuard/wireguard-tools`](https://github.com/WireGuard/wireguard-tools)
- Configuration is manual and symmetric: each peer needs a keypair, and each side's config lists the
  other peer's public key plus `AllowedIPs`. Unlike Tailscale, there's no coordination
  server/managed control plane included — you are responsible for distributing keys, keeping the
  Mac's dynamic IP reachable (or using a rendezvous/relay of your own), and running the WireGuard
  interface on both the Dokku host (which means installing a kernel module or userspace WireGuard
  binary inside/alongside the Dokku container, an added operational surface Dokku doesn't manage
  natively) and the Mac.

---

## 3. Setup/maintenance cost for a solo project, and overkill-relative-to-Redis-boundary considerations

These are cost/tradeoff notes only, organized per option — no ranking or recommendation is drawn.

| Option | What primary sources establish it requires | Ongoing maintenance implied |
|---|---|---|
| **Worker → Redis (TLS + password/ACL only, no extra layer)** | Set `tls` (and/or a `rediss://` URL) and `password`/`username` in the ioredis-shaped `connection` object BullMQ passes through — a config-only change, no new moving parts. Both features are first-class in ioredis's own README. | Credential/cert rotation only if the Redis provider requires it; no additional process to run. |
| **Shared API key / HMAC header over HTTPS (Jobs API)** | App-level code in the queue service and orchestration service to check a header; HTTPS itself is presumably already terminated by Dokku's per-app certs. | Rotating a shared secret; no infrastructure to operate. |
| **mTLS on the Jobs API via Dokku** | A hand-maintained `nginx.conf.sigil` (Dokku has no native `ssl_client_certificate` support per dokku/dokku#4409), plus a self-run CA to issue/rotate the orchestration service's client cert. | Keeping the custom nginx template in sync across Dokku upgrades (Dokku validates it with `nginx -t` on every deploy, so a mismatch surfaces at deploy time, not silently), plus manual cert issuance/rotation/revocation with no tooling support from Dokku itself. |
| **Tailscale (mesh)** | Install the client on both the Mac and the Dokku host, sign into one account; addressing/ACLs handled by Tailscale's control plane. | An external account/service dependency; Tailscale's coordination server is a third party in the path for peer discovery (though the data plane is direct/encrypted P2P per their own docs). |
| **Cloudflare Tunnel** | Requires the domain to be on Cloudflare (nameserver change) if not already, plus running the `cloudflared` daemon on the origin(s). | One more long-running process per side to keep up; ties the setup to Cloudflare's DNS/edge as a dependency. |
| **WireGuard (self-run, no Tailscale)** | Manual keypair generation and config distribution for every peer; no built-in NAT traversal/coordination — the operator solves rendezvous (e.g., the Mac's IP changing) themselves. | Fully self-managed key rotation, peer config updates, and running the interface on the Dokku host (an extra system-level component alongside the Dokku-managed containers). |

Whether any of the Jobs-API-hardening or mesh/tunnel options are *needed at all* given that the
worker's only inbound-facing dependency is an already-authenticated, already-TLS-capable Redis
connection (per section 1) is a judgment call the primary sources above don't make for you — none of
BullMQ, ioredis, Dokku, Tailscale, Cloudflare, or WireGuard's own docs stake out a position on when a
second layer is warranted on top of an authenticated Redis connection; that assessment is left to
whoever operates the system, which is why it's marked for the separate follow-up ticket (#240).

---

## Sources consulted

- BullMQ — connections/config docs: https://docs.bullmq.io/guide/connections (fetched via `raw.githubusercontent.com` copy at `taskforcesh/bullmq`, since `docs.bullmq.io` was sandbox-network-policy-blocked)
- BullMQ — source, `RedisConnection`: https://github.com/taskforcesh/bullmq/blob/master/src/classes/redis-connection.ts
- BullMQ — repo root/README: https://github.com/taskforcesh/bullmq
- ioredis — README (features, auth, TLS options, ACL): https://github.com/redis/ioredis#readme and https://github.com/redis/ioredis#tls-options
- Dokku — SSL configuration docs: https://github.com/dokku/dokku/blob/master/docs/configuration/ssl.md
- Dokku — nginx proxy docs (custom `nginx.conf.sigil`): https://github.com/dokku/dokku/blob/master/docs/networking/proxies/nginx.md
- Dokku — feature request for client-cert/mTLS support (closed): https://github.com/dokku/dokku/issues/4409
- Tailscale — client/daemon source repo: https://github.com/tailscale/tailscale
- Tailscale — "What is Tailscale?" KB page: https://tailscale.com/kb/1151/what-is-tailscale (sandbox-network-policy-blocked to fetch directly; content via search-index snippet of the primary page)
- Cloudflare — `cloudflared` source repo: https://github.com/cloudflare/cloudflared
- Cloudflare — Cloudflare Tunnel / Connect Networks docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ and https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/ (sandbox-network-policy-blocked to fetch directly; content via search-index snippet of the primary page)
- WireGuard — official site: https://www.wireguard.com/ (sandbox-network-policy-blocked to fetch directly; content via search-index snippet of the primary page)
- WireGuard — `wireguard-tools` source repo (`wg`, `wg-quick`): https://github.com/WireGuard/wireguard-tools
- ertrzyiks/ertrzyiks.me issue #239 (this ticket, for scope/wording): https://github.com/ertrzyiks/ertrzyiks.me/issues/239
