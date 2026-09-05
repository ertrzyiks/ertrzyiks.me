// Shared OpenRouter HTTP client plumbing — a plain chat completion helper — used by openRouter.ts
// (action item + calendar event extraction, #238, moved from a local LM Studio server to
// OpenRouter's cloud API so `extract-action-items` no longer needs a Mac to run on; see this
// queue's README section for why that constraint existed and what changed). OpenRouter speaks the
// same OpenAI-compatible `/chat/completions` shape LM Studio did, so this file mirrors the old
// lmStudioClient.ts's closely — the one structural difference is that a cloud provider has no
// "whatever's currently loaded" concept to discover via an API call, so the model id is just part
// of the request (`DEFAULT_OPENROUTER_MODEL` below, or `OPENROUTER_MODEL` — see
// openRouter.ts/server.ts).
//
// Two things this file deliberately does *not* do, both dropped after testing against a real
// account rather than by design upfront:
//
// - Pick a specific model itself, by scanning OpenRouter's public `/models` catalog for a free,
//   text-output entry. OpenRouter's per-account/workspace guardrails (Zero Data Retention,
//   "no free-model training on my data", etc. — configured at
//   https://openrouter.ai/workspaces/default/guardrails) exclude specific model endpoints for
//   reasons the public catalog has no way to expose, so a client-side pick can land on a model
//   this account can't actually call. `openrouter/free` (below) is OpenRouter's own first-party
//   free auto-router — it resolves to a real, currently-available, guardrail-compliant free
//   endpoint server-side, which a catalog scan run from outside the account structurally cannot.
// - Request `response_format` (OpenAI-style JSON-schema or even plain JSON-object mode) to
//   constrain the response. Several models this router's free pool actually landed on for the
//   guardrailed test account above rejected `response_format` outright — a hard 400 ("model
//   features structured outputs not support"), not a graceful ignore — including its *loosest*
//   "json_object" mode, not just strict JSON-schema. The exact same requests, with
//   `response_format` dropped and the desired JSON shape spelled out in the prompt text instead
//   (see openRouter.ts), succeeded the large majority of the time on those same models. Structured
//   outputs are common among frontier/paid models but evidently not reliable across a free-tier
//   router's pool, so this file asks for JSON the same way any chat model can already produce it —
//   by being told to — and leaves shape validation entirely to the caller
//   (`parseExtractionResult` in openRouter.ts).
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

// OpenRouter's own first-party auto-router for its free model lineup (see
// https://openrouter.ai/openrouter/free) — resolves to whichever specific free, currently
// available model/provider actually works for the calling account at request time, rather than a
// single named model this file would otherwise have to guess and keep up to date by hand. See the
// header comment above for why that beats picking one ourselves from the public catalog.
export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  // Pins a specific model instead of DEFAULT_OPENROUTER_MODEL — set `OPENROUTER_MODEL` (see
  // server.ts) if you'd rather know and control exactly which model/provider reads email content.
  model?: string;
  // Test seam — a fake `fetch` swapped in so the request/response shape can be asserted without a
  // real OpenRouter account/network call (mirrors lmStudioClient.ts's own `fetchImpl` seam, kept
  // for the same reason: cheap, deterministic tests with no live dependency).
  fetchImpl?: typeof fetch;
}

interface OpenRouterChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

// A fenced code block a model wrapped its JSON in despite being told not to
// (```json\n...\n``` or plain ```\n...\n```) — stripped defensively before parsing rather than
// trusted to never happen, since nothing here enforces the response actually be bare JSON (see
// this file's header comment for why not). A no-op on content that's already bare JSON.
const CODE_FENCE = /^```[a-z]*\n([\s\S]*?)\n?```$/i;

function stripCodeFence(content: string): string {
  const match = content.trim().match(CODE_FENCE);
  return match ? match[1] : content;
}

// Posts one chat completion — a system + user turn — and returns the parsed JSON content. The
// caller (openRouter.ts) is responsible for instructing the model on the exact JSON shape to
// return in `systemPrompt`/`userPrompt` and for validating the returned `unknown` into that shape;
// this file makes no attempt to enforce or verify it beyond "is this parseable JSON". A request
// failure or malformed content surfaces as a normal job failure (retried both by openRouter.ts's
// own short retry loop and, if that's exhausted, per queue.ts's backoff policy), same as any other
// extraction error.
export async function requestJsonCompletion(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl: typeof fetch;
  systemPrompt: string;
  userPrompt: string;
}): Promise<unknown> {
  const { baseUrl, apiKey, model, fetchImpl, systemPrompt, userPrompt } = params;

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
    return JSON.parse(stripCodeFence(content));
  } catch (cause) {
    throw new Error("OpenRouter response content was not valid JSON", { cause });
  }
}
