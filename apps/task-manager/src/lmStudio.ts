// Calls LM Studio's local OpenAI-compatible server to extract action items from
// an email (#238). Never leaves the Mac — `baseUrl` defaults to localhost, and this
// is the only model call the worker makes. Uses the platform `fetch` (Node 22) with
// no extra HTTP/SDK dependency, since LM Studio's API surface here is small.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActionItem } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";

export interface ActionItemExtractor {
  extract(email: EmailContent): Promise<ActionItem[]>;
}

// `__dirname` from the CJS wrapper esbuild's output runs under, when it's defined —
// which it never is in this file's own true-ESM form (dev via `tsx`, tests via
// `vitest`), only once bundled to CJS for the production `pkg` binary (see
// scripts/release-worker.mjs). That distinction matters here because esbuild does
// NOT carry `import.meta.url` through its CJS output — it silently empties it
// instead (a `new URL(..., import.meta.url)` call on the empty string throws
// `ERR_INVALID_URL` at runtime, verified by hand) — so it can't be used
// unconditionally. `typeof __dirname` is a safe check even in genuine ESM, where
// `__dirname` is simply unbound rather than `undefined`: the `typeof` operator
// never throws on an unresolvable reference.
declare const __dirname: string | undefined;

function resolvePromptsDir(): string {
  return typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
}

// Kept in its own file (rather than inline) so it reads and edits like prose, not a
// string embedded in TS. Read once at module load. In the pkg-packaged production
// binary this resolves inside pkg's own virtual snapshot filesystem, not real disk —
// release-worker.mjs copies this prompts/ directory next to the bundle and declares
// it as a pkg "asset" so it's actually embedded there; see that script's comments.
const systemPromptPath = join(resolvePromptsDir(), "prompts/extractActionItems.system.md");
const systemPrompt = readFileSync(systemPromptPath, "utf8").trim();

export interface LmStudioConfig {
  baseUrl?: string;
  // Test seam — a fake `fetch` swapped in so the request/response shape can be
  // asserted without a real LM Studio server running (this can't be exercised for
  // real in CI/sandbox, there is no LM Studio instance to talk to).
  fetchImpl?: typeof fetch;
}

const actionItemsJsonSchema = {
  type: "object",
  properties: {
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          // Constrains the model to ISO 8601 (`yyyy-mm-dd`) when it does emit a due date, so
          // downstream `toGoogleTasksDue` in googleTasksClient.ts (which parses via `new
          // Date(...)`, and only reliably understands this format — bare `dd-mm-yyyy` is either
          // rejected or silently misread as `mm-dd-yyyy`) gets something it can actually use.
          // `pattern` is a no-op on `null` values — JSON Schema string keywords only apply to
          // string instances — so "no due date" is still expressed as `null`, not a magic string.
          dueDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
        required: ["title", "description", "dueDate"],
        additionalProperties: false,
      },
    },
  },
  required: ["actionItems"],
  additionalProperties: false,
} as const;

interface LmStudioModelsResponse {
  data?: Array<{ id?: string }>;
}

interface LmStudioChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function getLoadedModelId(baseUrl: string, fetchImpl: typeof fetch): Promise<string> {
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

function buildPrompt(email: EmailContent): string {
  return [
    `Subject: ${email.subject}`,
    `From: ${email.from}`,
    "",
    email.body,
  ].join("\n");
}

function parseActionItems(response: LmStudioChatCompletionResponse): ActionItem[] {
  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LM Studio response contained no message content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new Error("LM Studio response content was not valid JSON", { cause });
  }

  const actionItems = (parsed as { actionItems?: unknown }).actionItems;
  if (!Array.isArray(actionItems)) {
    throw new Error("LM Studio response was missing an actionItems array");
  }

  return actionItems as ActionItem[];
}

export function createLmStudioExtractor(config: LmStudioConfig = {}): ActionItemExtractor {
  const baseUrl = config.baseUrl ?? "http://localhost:1234";
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async extract(email: EmailContent): Promise<ActionItem[]> {
      const model = await getLoadedModelId(baseUrl, fetchImpl);

      const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            { role: "user", content: buildPrompt(email) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "action_items",
              schema: actionItemsJsonSchema,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `LM Studio /v1/chat/completions request failed: ${response.status} ${response.statusText}`,
        );
      }

      const body = (await response.json()) as LmStudioChatCompletionResponse;
      return parseActionItems(body);
    },
  };
}
