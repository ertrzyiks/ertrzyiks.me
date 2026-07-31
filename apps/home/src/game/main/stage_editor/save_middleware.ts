import type { IncomingMessage, ServerResponse } from "node:http";
import { saveStageFiles, loadStageFiles, DEFAULT_SAVE_TARGET } from "./persist_stage";

/** Well past any real board+roster JSON payload, small enough to cap memory use from an oversized POST. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    raw += chunk.toString("utf-8");
  }
  return JSON.parse(raw);
}

interface ValidatedSaveRequestBody {
  name: string;
  board: unknown;
  stageRoster: unknown;
}

function isSaveRequestBody(value: unknown): value is ValidatedSaveRequestBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.name === "string" && !!body.board && !!body.stageRoster;
}

/**
 * A minimal structural stand-in for Vite's own `ViteDevServer`, covering
 * only what this plugin calls. Avoids importing the `vite` package purely
 * for its types — `vite` is astro's transitive dependency here, not this
 * app's own — while still type-checking `req`/`res` against Node's real
 * `http` types.
 */
interface DevServerLike {
  middlewares: {
    use(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
  };
}

/**
 * Dev-only Stage Editor API (issue #170 "Persistence": "A dev-only disk-write
 * endpoint (Vite/Astro dev middleware, import.meta.env.DEV-gated) writes the
 * board file... and the stage-roster file... to disk on Save"; user story 16:
 * "reopen a previously saved stage and see its board/spawns/rosters/win
 * section reflected in the editor"). `apply: "serve"` is Vite's
 * plugin-config-level equivalent of the `import.meta.env.DEV` guard every
 * dev-only Astro page in this repo uses (see src/pages/interaction-harness.astro)
 * — `import.meta.env.DEV` itself only exists in browser/SSR runtime code, not
 * in a Vite plugin's own Node config code, so `apply: "serve"` is the correct
 * dev-only gate here: these routes, and the disk access behind them, are
 * never registered when Astro builds for production.
 *
 * `POST /api/stage-editor/save` with `{ name, board, stageRoster }`.
 * `GET /api/stage-editor/load?name=<name>` returns `{ board, stageRoster }`.
 * All the actual save/load logic (including the path-traversal-safe name
 * check and the hand-written-factory overwrite guard) lives in
 * `persist_stage.ts`, tested directly against a real temp directory — these
 * handlers are deliberately thin, mostly-untested adapters (issue #170
 * Testing Decisions: "Explicitly not covered:... the dev-only disk-write
 * endpoint's actual file I/O"), parsing the HTTP request and handing off to
 * those tested functions rather than duplicating their logic here.
 *
 * Save requires `Content-Type: application/json`: it's a state-changing,
 * unauthenticated POST on a server that (per astro.config.mjs) listens on
 * `0.0.0.0`, so it's reachable from any page a developer's browser has open,
 * or from the LAN, while `astro dev` runs. A cross-origin "simple request"
 * (the CSRF-relevant case: no preflight) cannot set this header to
 * `application/json`, so requiring it here — on top of `isValidStageName`'s
 * path-traversal defense and the overwrite guard — closes that gap without
 * needing real auth on what is otherwise a local dev tool. Load is a plain
 * GET with no side effects, so the same requirement doesn't apply to it.
 */
export function stageEditorApiPlugin() {
  return {
    name: "stage-editor-api",
    apply: "serve" as const,
    configureServer(server: DevServerLike) {
      server.middlewares.use("/api/stage-editor/save", (req, res) => {
        void handleSaveRequest(req, res);
      });
      server.middlewares.use("/api/stage-editor/load", (req, res) => {
        void handleLoadRequest(req, res);
      });
    },
  };
}

async function handleSaveRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.startsWith("application/json")) {
    res.statusCode = 400;
    res.end("Expected Content-Type: application/json");
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (!isSaveRequestBody(body)) {
      res.statusCode = 400;
      res.end("Expected JSON body { name: string, board, stageRoster }");
      return;
    }

    await saveStageFiles(body.name, body.board as never, body.stageRoster as never, DEFAULT_SAVE_TARGET);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    res.statusCode = 400;
    res.end(error instanceof Error ? error.message : "Save failed");
  }
}

async function handleLoadRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const url = new URL(req.url ?? "", "http://localhost");
  const name = url.searchParams.get("name");
  if (!name) {
    res.statusCode = 400;
    res.end("Expected ?name=<stage name>");
    return;
  }

  try {
    const { board, stageRoster } = await loadStageFiles(name, DEFAULT_SAVE_TARGET);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ board, stageRoster }));
  } catch (error) {
    res.statusCode = 404;
    res.end(error instanceof Error ? error.message : "Load failed");
  }
}
