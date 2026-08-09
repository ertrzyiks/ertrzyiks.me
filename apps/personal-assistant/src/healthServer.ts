import { createServer, type Server } from "node:http";
import { isValidBasicAuth } from "./auth.js";
import type { Logger } from "./logger.js";
import type { Store } from "./store.js";

export interface HealthServer {
  close(): void;
}

/** Basic Auth credentials guarding the `/admin/status` dashboard (#297/#312). */
export interface DashboardAuth {
  username: string;
  password: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const RECENT_FAILURES_LIMIT = 50;

/**
 * Renders the snapshot dashboard: current email counts by status (unbounded — a cheap
 * aggregate regardless of table size) and the most recently updated failed emails, capped at
 * `RECENT_FAILURES_LIMIT` since the `emails` table has no retention/cleanup policy (#297).
 */
function renderStatusPage(store: Store): string {
  const counts = store.getStatusCounts();
  const failures = store.getRecentFailures(RECENT_FAILURES_LIMIT);

  const countRows = counts
    .map((row) => `<tr><td>${escapeHtml(row.status)}</td><td>${row.count}</td></tr>`)
    .join("\n");

  const failureRows = failures
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.errorMessage ?? "")}</td><td>${escapeHtml(row.updatedAt)}</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>personal-assistant status</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
  table { border-collapse: collapse; margin: 1rem 0 2rem; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.8rem; text-align: left; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
</style>
</head>
<body>
<h1>personal-assistant status</h1>
<h2>Emails by status</h2>
<table>
<thead><tr><th>Status</th><th>Count</th></tr></thead>
<tbody>${countRows || '<tr><td colspan="2">No emails yet</td></tr>'}</tbody>
</table>
<h2>Recent failures (up to ${RECENT_FAILURES_LIMIT})</h2>
<table>
<thead><tr><th>Email ID</th><th>Error</th><th>Updated</th></tr></thead>
<tbody>${failureRows || '<tr><td colspan="3">No failures</td></tr>'}</tbody>
</table>
</body>
</html>
`;
}

/**
 * personal-assistant otherwise has no HTTP surface (see Dockerfile) — this exists so Dokku's
 * proxy has something to route the domain to and health-check against (`GET /health`, no
 * dependency check behind it, just liveness), and now also hosts the Basic-Auth-guarded
 * snapshot dashboard (`GET /admin/status`, #297/#312) on the same process/port rather than
 * standing up a second listener.
 */
export function createHealthServer(store: Store, auth: DashboardAuth): Server {
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "GET" && req.url === "/admin/status") {
      if (!isValidBasicAuth(req.headers.authorization, auth.username, auth.password)) {
        res.writeHead(401, { "WWW-Authenticate": 'Basic realm="personal-assistant"' });
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderStatusPage(store));
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

export function startHealthServer(
  port: number,
  store: Store,
  auth: DashboardAuth,
  logger?: Logger,
): HealthServer {
  const server = createHealthServer(store, auth);

  server.listen(port, () => {
    logger?.info(`health server listening on port ${port}`);
  });

  return {
    close() {
      server.close();
    },
  };
}
