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
  app.log.info(`kstatus listening on port ${config.port}`);
  app.log.info(
    config.adminBasicAuth
      ? "/admin is protected by Basic Auth"
      : "/admin has NO auth configured — this should never happen in production",
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
