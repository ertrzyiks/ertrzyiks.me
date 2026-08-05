// Local dev entrypoint only. Loads `.env` and mounts the Bull Board queue UI
// on top of the same `createApp`/`createQueue` production building blocks —
// `server.ts` (the Dokku production entrypoint) never imports this file or
// the `dotenv`/`@bull-board/*` packages it pulls in.
import "dotenv/config";
import { createApp } from "./app.js";
import { createQueue } from "./queue.js";
import { BULL_BOARD_BASE_PATH, registerBullBoard } from "./bullBoard.js";

const redisUrl = process.env.REDIS_URL;
const bearerToken = process.env.JOBS_API_BEARER_TOKEN;
const port = Number(process.env.PORT ?? 3000);

if (!redisUrl) throw new Error("REDIS_URL is required");
if (!bearerToken) throw new Error("JOBS_API_BEARER_TOKEN is required");

const queue = createQueue(redisUrl);
const app = createApp(queue, bearerToken);

await registerBullBoard(app, queue);

app.listen({ port, host: "0.0.0.0" }).then(() => {
  app.log.info(`task-manager (dev) listening on port ${port}`);
  app.log.info(`Bull Board UI available at http://localhost:${port}${BULL_BOARD_BASE_PATH}`);
});
