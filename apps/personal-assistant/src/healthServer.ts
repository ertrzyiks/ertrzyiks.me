import { createServer, type Server } from "node:http";
import type { Logger } from "./poller.js";

export interface HealthServer {
  close(): void;
}

/**
 * personal-assistant otherwise has no HTTP surface (see Dockerfile) — this exists purely so
 * Dokku's proxy has something to route the domain to and health-check against. Responds to
 * GET /health with 200 whenever the process is up; there's no dependency check (Gmail, Jobs
 * API, sqlite) behind it, just liveness.
 */
export function createHealthServer(): Server {
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
}

export function startHealthServer(port: number, logger?: Logger): HealthServer {
  const server = createHealthServer();

  server.listen(port, () => {
    logger?.info(`health server listening on port ${port}`);
  });

  return {
    close() {
      server.close();
    },
  };
}
