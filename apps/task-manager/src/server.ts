import { createApp } from "./app.js";
import { createQueue } from "./queue.js";

const redisUrl = process.env.REDIS_URL;
const bearerToken = process.env.JOBS_API_BEARER_TOKEN;
const port = Number(process.env.PORT ?? 3000);

if (!redisUrl) throw new Error("REDIS_URL is required");
if (!bearerToken) throw new Error("JOBS_API_BEARER_TOKEN is required");

const queue = createQueue(redisUrl);
const app = createApp(queue, bearerToken);

try {
  await app.listen({ port, host: "::" });
  app.log.info(`task-manager listening on port ${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
