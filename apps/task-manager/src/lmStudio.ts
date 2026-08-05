// Calls LM Studio's local OpenAI-compatible server to extract action items from
// an email (#238). Never leaves the Mac — `baseUrl` defaults to localhost, and this
// is the only model call the worker makes. Uses the platform `fetch` (Node 22) with
// no extra HTTP/SDK dependency, since LM Studio's API surface here is small.
import type { ActionItem } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";

export interface ActionItemExtractor {
  extract(email: EmailContent): Promise<ActionItem[]>;
}

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
          dueDate: { type: ["string", "null"] },
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
              content:
                "Extract action items from the email below. Respond only with the requested JSON shape. If there are no action items, return an empty array.",
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
