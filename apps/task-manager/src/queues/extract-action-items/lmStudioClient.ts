// Shared LM Studio HTTP client plumbing — model discovery plus a structured chat completion
// helper — used by every LM Studio caller in this package: src/lmStudio.ts (action item
// extraction, #238) and src/actionItemJudge.ts (judging each extracted action item). Split out
// once a second caller needed the exact same "read a prompt file next to this bundle, discover
// the loaded model, POST a JSON-schema-constrained chat completion" plumbing lmStudio.ts already
// had, so the request shape and error messages stay identical across both call sites instead of
// drifting apart as separate copies.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `__dirname` from the CJS wrapper esbuild's output runs under, when it's defined — which it
// never is in this file's own true-ESM form (dev via `tsx`, tests via `vitest`), only once
// bundled to CJS for the production `pkg` binary (see scripts/release-worker.mjs). That
// distinction matters here because esbuild does NOT carry `import.meta.url` through its CJS
// output — it silently empties it instead (a `new URL(..., import.meta.url)` call on the empty
// string throws `ERR_INVALID_URL` at runtime, verified by hand) — so it can't be used
// unconditionally. `typeof __dirname` is a safe check even in genuine ESM, where `__dirname` is
// simply unbound rather than `undefined`: the `typeof` operator never throws on an unresolvable
// reference.
declare const __dirname: string | undefined;

function resolvePromptsDir(): string {
  return typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
}

// Reads and trims a prompt file from src/prompts/ (or dist-bin/prompts/ once bundled —
// release-worker.mjs copies that directory alongside the bundle and declares it a pkg "asset",
// see that script's comments, so this resolves inside pkg's virtual filesystem in production
// too). Read once per caller at module load, same as the single prompt lmStudio.ts used to read
// inline before this file existed.
export function readSystemPrompt(filename: string): string {
  const path = join(resolvePromptsDir(), "prompts", filename);
  return readFileSync(path, "utf8").trim();
}

export const DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234";

export interface LmStudioConfig {
  baseUrl?: string;
  // Test seam — a fake `fetch` swapped in so the request/response shape can be asserted without a
  // real LM Studio server running (this can't be exercised for real in CI/sandbox, there is no LM
  // Studio instance to talk to).
  fetchImpl?: typeof fetch;
}

interface LmStudioModelsResponse {
  data?: Array<{ id?: string }>;
}

export async function getLoadedModelId(baseUrl: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(`${baseUrl}/v1/models`);
  if (!response.ok) {
    throw new Error(`LM Studio /v1/models request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as LmStudioModelsResponse;
  const modelId = body.data?.[0]?.id;
  if (!modelId) {
    throw new Error("LM Studio has no model currently loaded");
  }
  return modelId;
}

interface LmStudioChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

// Posts one structured chat completion — a system + user turn, constrained to `jsonSchema` via LM
// Studio's OpenAI-compatible `response_format` — and returns the parsed JSON content. Callers
// validate the returned `unknown` into their own shape (extractor: an `actionItems` array; judge:
// a `keep`/`reason` verdict) since that's the one thing that differs between them.
export async function requestStructuredCompletion(params: {
  baseUrl: string;
  fetchImpl: typeof fetch;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  jsonSchema: object;
}): Promise<unknown> {
  const { baseUrl, fetchImpl, systemPrompt, userPrompt, schemaName, jsonSchema } = params;
  const model = await getLoadedModelId(baseUrl, fetchImpl);

  const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, schema: jsonSchema },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `LM Studio /v1/chat/completions request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as LmStudioChatCompletionResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LM Studio response contained no message content");
  }

  try {
    return JSON.parse(content);
  } catch (cause) {
    throw new Error("LM Studio response content was not valid JSON", { cause });
  }
}
