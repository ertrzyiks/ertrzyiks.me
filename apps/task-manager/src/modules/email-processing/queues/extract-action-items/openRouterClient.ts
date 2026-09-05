// Shared OpenRouter HTTP client plumbing — a structured chat completion helper — used by
// openRouter.ts (action item + calendar event extraction, #238, moved from a local LM Studio
// server to OpenRouter's cloud API so `extract-action-items` no longer needs a Mac to run on; see
// this queue's README section for why that constraint existed and what changed). OpenRouter
// speaks the same OpenAI-compatible `/chat/completions` shape LM Studio did, so this file mirrors
// the old lmStudioClient.ts closely — the one structural difference is that a cloud provider has
// no "whatever's currently loaded" concept to discover via a `/v1/models` call, so the model id is
// just part of the request, sourced from config/`OPENROUTER_MODEL` (see openRouter.ts).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `__dirname` from the CJS wrapper esbuild's output runs under, when it's defined — which it
// never is in this file's own true-ESM form (dev via `tsx`, tests via `vitest`). Kept even though
// nothing in this package still bundles to CJS for a standalone binary (that was worker.ts's
// pkg-packaged Mac executable, removed along with it) — `dist/` itself is still plain Node ESM
// output from `tsc`, where `import.meta.url` always resolves fine, so this check is just cheap
// insurance against ever needing it again rather than something exercised today.
declare const __dirname: string | undefined;

function resolvePromptsDir(): string {
  return typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
}

// Reads and trims a prompt file from src/prompts/. Read once per caller at module load.
export function readSystemPrompt(filename: string): string {
  const path = join(resolvePromptsDir(), "prompts", filename);
  return readFileSync(path, "utf8").trim();
}

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// OpenRouter's free tier rotates which specific models carry the `:free` suffix, so this is a
// starting point, not a permanent identifier — override via `OPENROUTER_MODEL` (see server.ts) if
// this one is ever retired or rate-limited harder than it used to be. Check
// https://openrouter.ai/models?max_price=0 for the current free lineup.
export const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  // Test seam — a fake `fetch` swapped in so the request/response shape can be asserted without a
  // real OpenRouter account/network call (mirrors lmStudioClient.ts's own `fetchImpl` seam, kept
  // for the same reason: cheap, deterministic tests with no live dependency).
  fetchImpl?: typeof fetch;
}

interface OpenRouterChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

// Posts one structured chat completion — a system + user turn, constrained to `jsonSchema` via
// OpenRouter's OpenAI-compatible `response_format` — and returns the parsed JSON content. The
// caller validates the returned `unknown` into its own shape (openRouter.ts: `actionItems`/
// `events` arrays). Not every free model on OpenRouter honors `response_format`'s `json_schema`
// mode equally strictly — a request failure or malformed content here surfaces as a normal job
// failure (retried per queue.ts's backoff policy) same as any other extraction error, rather than
// something this client tries to paper over.
export async function requestStructuredCompletion(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl: typeof fetch;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  jsonSchema: object;
}): Promise<unknown> {
  const { baseUrl, apiKey, model, fetchImpl, systemPrompt, userPrompt, schemaName, jsonSchema } =
    params;

  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // Both optional per OpenRouter's docs (attribution for their public rankings, not an auth
      // requirement) — set to fixed, non-secret values rather than left off, since they're free to
      // provide and cost nothing to include.
      "HTTP-Referer": "https://github.com/ertrzyiks/ertrzyiks.me",
      "X-Title": "task-manager extract-action-items",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, schema: jsonSchema, strict: true },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter /chat/completions request failed: ${response.status} ${response.statusText}` +
        (body ? ` — ${body}` : ""),
    );
  }

  const body = (await response.json()) as OpenRouterChatCompletionResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter response contained no message content");
  }

  try {
    return JSON.parse(content);
  } catch (cause) {
    throw new Error("OpenRouter response content was not valid JSON", { cause });
  }
}
