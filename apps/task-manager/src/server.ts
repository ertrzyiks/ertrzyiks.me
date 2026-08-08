// Single entrypoint for both local dev and production (Dokku runs this via `pnpm start` →
// `node dist/server.js`) — previously split into this file (prod-only) and devServer.ts
// (dev-only, so Bull Board and its `dotenv`/`@bull-board/*` dependencies stayed out of
// production). That split stopped paying for itself once Bull Board needed to be always-on in
// production too (#296/#311): `dotenv/config` is a no-op when no `.env` file exists, which is the
// case in production, so loading it unconditionally is safe.
import "dotenv/config";
import { createApp } from "./app.js";
import { isValidBasicAuth } from "./auth.js";
import { BULL_BOARD_BASE_PATH, registerBullBoard } from "./bullBoard.js";
import { createQueue } from "./queue.js";

const redisUrl = process.env.REDIS_URL;
const bearerToken = process.env.JOBS_API_BEARER_TOKEN;
const port = Number(process.env.PORT ?? 3000);
const bullBoardUsername = process.env.TASK_MANAGER_BULL_BOARD_BASIC_AUTH_USERNAME;
const bullBoardPassword = process.env.TASK_MANAGER_BULL_BOARD_BASIC_AUTH_PASSWORD;

if (!redisUrl) throw new Error("REDIS_URL is required");
if (!bearerToken) throw new Error("JOBS_API_BEARER_TOKEN is required");

const queue = createQueue(redisUrl);
const app = createApp(queue, bearerToken);

// Bull Board is always mounted. Basic Auth guards it only when both credentials are configured:
// unset — the normal local dev state, nothing in .env by default — leaves it open, matching the
// low-friction workflow this had before merging out of devServer.ts. Production always sets both
// via Terraform (#313), so the guard is always active there. This scheme is intentionally
// separate from the /jobs API's Bearer auth in app.ts — Bull Board needs to be reachable from a
// plain browser tab, which can't attach an Authorization: Bearer header the way an API client can.
if (bullBoardUsername && bullBoardPassword) {
  await app.register(async (bullBoardApp) => {
    bullBoardApp.addHook("onRequest", async (request, reply) => {
      if (!isValidBasicAuth(request.headers.authorization, bullBoardUsername, bullBoardPassword)) {
        await reply.code(401).header("WWW-Authenticate", 'Basic realm="task-manager"').send();
      }
    });

    await registerBullBoard(bullBoardApp, queue);
  });
} else {
  await registerBullBoard(app, queue);
}

try {
  await app.listen({ port, host: "::" });
  app.log.info(`task-manager listening on port ${port}`);
  app.log.info(`Bull Board UI available at http://localhost:${port}${BULL_BOARD_BASE_PATH}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
