// Local dev entrypoint only. Loads `.env` before pulling in the same server wiring the
// production entrypoint uses — the production entrypoint (`server.ts`, what Dokku actually
// runs via `pnpm start`) never imports `dotenv`.
import "dotenv/config";
import "./server.js";
