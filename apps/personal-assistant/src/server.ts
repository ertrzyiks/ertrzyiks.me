import { loadConfig } from "./config.js";
import { createGmailClient } from "./gmailClient.js";
import { createJobsApiClient } from "./jobsApiClient.js";
import type { Logger } from "./poller.js";
import { startPolling } from "./runner.js";
import { createStore } from "./store.js";

const config = loadConfig();

const logger: Logger = {
  info: (message) => console.log(`[personal-assistant] ${message}`),
  warn: (message) => console.warn(`[personal-assistant] ${message}`),
  error: (message) => console.error(`[personal-assistant] ${message}`),
};

const store = createStore(config.databasePath);
const gmail = createGmailClient(config.gmail);
const jobsApi = createJobsApiClient(config.jobsApi);

logger.info(
  `starting: db=${config.databasePath} pollIntervalMs=${config.pollIntervalMs} jobsApiBaseUrl=${config.jobsApi.baseUrl}`,
);

const runner = startPolling({ gmail, jobsApi, store, logger }, config.pollIntervalMs);

function shutdown() {
  logger.info("shutting down");
  runner.stop();
  store.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
