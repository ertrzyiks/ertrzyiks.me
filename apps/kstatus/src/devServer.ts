// Local dev entrypoint only. Loads `.env` before delegating to the same wiring the production
// entrypoint uses. `server.ts` (the Dokku production entrypoint) never imports this file or the
// `dotenv` package it pulls in.
import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";

const config = loadConfig();
const store = createStore(config.databasePath);
const app = createApp(store, config.adminBasicAuth);

function shutdown() {
  app.log.info("shutting down");
  store.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

try {
  await app.listen({ port: config.port, host: "::" });
  app.log.info(`kstatus (dev) listening on http://localhost:${config.port}`);
  app.log.info(
    config.adminBasicAuth
      ? `/admin requires Basic Auth (KSTATUS_ADMIN_BASIC_AUTH_USERNAME/PASSWORD are set)`
      : `/admin is open with no auth — set KSTATUS_ADMIN_BASIC_AUTH_USERNAME/PASSWORD in .env to exercise the Basic Auth guard locally`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
