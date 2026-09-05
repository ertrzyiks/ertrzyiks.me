// Shared OpenRouter HTTP client plumbing — free-model discovery plus a structured chat completion
// helper — used by openRouter.ts (action item + calendar event extraction, #238, moved from a
// local LM Studio server to OpenRouter's cloud API so `extract-action-items` no longer needs a Mac
// to run on; see this queue's README section for why that constraint existed and what changed).
// OpenRouter speaks the same OpenAI-compatible `/chat/completions` shape LM Studio did, so
// `requestStructuredCompletion` mirrors the old lmStudioClient.ts's closely; `pickFreeModel` below
// replaces that file's `getLoadedModelId` — LM Studio's "whatever's currently loaded" query has no
// cloud equivalent, but OpenRouter's `/models` catalog plays the same "don't make the caller name
// a model" role, filtered down to ones that cost nothing to call.
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

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  // Pins a specific model, skipping `pickFreeModel` entirely — set `OPENROUTER_MODEL` (see
  // server.ts) if you want a fixed choice instead of whatever free model this discovers.
  model?: string;
  // Test seam — a fake `fetch` swapped in so the request/response shape can be asserted without a
  // real OpenRouter account/network call (mirrors lmStudioClient.ts's own `fetchImpl` seam, kept
  // for the same reason: cheap, deterministic tests with no live dependency).
  fetchImpl?: typeof fetch;
}

interface OpenRouterChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

// The subset of OpenRouter's `GET /models` catalog entry shape this file actually reads — see
// https://openrouter.ai/docs/api-reference/list-available-models. `pricing` values are decimal
// strings (USD per token), not numbers.
interface OpenRouterCatalogModel {
  id: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { output_modalities?: string[] };
  supported_parameters?: string[];
}

interface OpenRouterModelsResponse {
  data?: OpenRouterCatalogModel[];
}

function isFreeTextModel(model: OpenRouterCatalogModel): boolean {
  // Both string fields, e.g. "0" for free or "0.000002" for paid — missing/unparseable is treated
  // as non-free rather than assumed free, since accidentally calling a paid model with no
  // OPENROUTER_MODEL override would be a nasty surprise. `architecture.output_modalities` filters
  // out entries that produce something other than text (e.g. an audio-generation model that
  // happens to be priced at zero) — this queue only ever wants a chat completion back.
  const prompt = Number(model.pricing?.prompt);
  const completion = Number(model.pricing?.completion);
  return (
    prompt === 0 &&
    completion === 0 &&
    (model.architecture?.output_modalities?.includes("text") ?? false)
  );
}

function supportsStructuredOutputs(model: OpenRouterCatalogModel): boolean {
  // "structured_outputs" is OpenRouter's flag for strict JSON-schema mode, which is what
  // `requestStructuredCompletion` below actually requests (`json_schema.strict: true`) — a model
  // only listing the looser "response_format" (plain JSON-object mode) isn't guaranteed to honor
  // that.
  return model.supported_parameters?.includes("structured_outputs") ?? false;
}

// Picks one model to extract with out of OpenRouter's current free lineup, so nothing here has to
// hardcode a model id that OpenRouter could retire or reprice at any time (see
// https://openrouter.ai/models?max_price=0 for the live list this queries). Prefers a free model
// that also declares strict JSON-schema support; falls back to any free text-output model if none
// of the free ones happen to declare it (extraction may then fail if the picked model doesn't
// actually honor `response_format` — same as any other extraction error, retried per queue.ts's
// backoff policy). Ties are broken by context length (a rough capability proxy — an email might be
// long) and then by id, so the same catalog snapshot always resolves the same model rather than
// picking arbitrarily between equally-ranked options.
export async function pickFreeModel(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter /models request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as OpenRouterModelsResponse;
  const freeTextModels = (body.data ?? []).filter(isFreeTextModel);
  const structuredFreeTextModels = freeTextModels.filter(supportsStructuredOutputs);
  const candidates = structuredFreeTextModels.length > 0 ? structuredFreeTextModels : freeTextModels;

  if (candidates.length === 0) {
    throw new Error("OpenRouter reported no free text-output models to extract with");
  }

  const [best] = [...candidates].sort((a, b) => {
    const byContextLength = (b.context_length ?? 0) - (a.context_length ?? 0);
    return byContextLength !== 0 ? byContextLength : a.id.localeCompare(b.id);
  });

  return best.id;
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
