import { createAxiomEventEmitter, noopEventEmitter, type EventEmitter } from "./axiomEvents.js";
import { loadConfig } from "./config.js";
import { createGmailClient } from "./gmailClient.js";
import { startHealthServer } from "./healthServer.js";
import { createJobsApiClient } from "./jobsApiClient.js";
import type { Logger } from "./logger.js";
import { startPolling } from "./runner.js";
import { initSentry } from "./sentry.js";
import { createStore } from "./store.js";

const config = loadConfig();
const port = Number(process.env.PORT ?? 3000);

// A no-op until SENTRY_DSN is provisioned (see sentry.ts and config.ts's `sentryDsn`). Called as
// early as the rest of this module's own wiring allows — after loadConfig() (whose own required-
// var checks aren't caught here, so a startup misconfiguration crash-loops visibly in Dokku's
// logs rather than going to Sentry) but before anything below that could itself throw.
initSentry(config.sentryDsn);

const logger: Logger = {
  info: (message) => console.log(`[personal-assistant] ${message}`),
  warn: (message) => console.warn(`[personal-assistant] ${message}`),
  error: (message) => console.error(`[personal-assistant] ${message}`),
};

const store = createStore(config.databasePath);
const gmail = createGmailClient(config.gmail);
const jobsApi = createJobsApiClient(config.jobsApi);

// Trend-event emission (#315) — a no-op until both AXIOM_TOKEN/AXIOM_DATASET are provisioned
// (config.axiom is null until then, same optional-at-startup treatment task-manager gives its
// own Todoist/library sync credentials).
const events: EventEmitter = config.axiom
  ? createAxiomEventEmitter({ ...config.axiom, service: "personal-assistant", logger })
  : noopEventEmitter;

logger.info(
  `starting: db=${config.databasePath} pollIntervalMs=${config.pollIntervalMs} jobsApiBaseUrl=${config.jobsApi.baseUrl}`,
);

const runner = startPolling({ gmail, jobsApi, store, logger, events }, config.pollIntervalMs);
const health = startHealthServer(port, store, config.dashboardBasicAuth, logger);

function shutdown() {
  logger.info("shutting down");
  runner.stop();
  health.close();
  store.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
