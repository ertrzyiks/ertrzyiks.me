import { describe, expect, it, vi } from "vitest";
import { createOpenRouterExtractor } from "./openRouter.js";
import type { EmailContent } from "./gmail.js";

// OpenRouter is a real cloud API — nothing to talk to in CI/sandbox, so every test here injects a
// fake `fetch` via the `fetchImpl` seam rather than making a real HTTP call (see
// openRouter.ts's OpenRouterConfig comment).

const EMAIL: EmailContent = {
  id: "email-1",
  subject: "Q3 planning",
  from: "boss@example.com",
  body: "Please send the report by Friday.",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("createOpenRouterExtractor", () => {
  it("posts a plain chat completion request with the configured model, API key, and JSON-shape instructions", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");

      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-api-key");

      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody.model).toBe("some/model:free");
      // No response_format — see openRouterClient.ts's header comment for why: several free
      // models rejected it outright in testing, including its loosest "json_object" mode.
      expect(requestBody.response_format).toBeUndefined();
      expect(requestBody.messages[0].content).toContain("Respond with a single JSON object");
      expect(requestBody.messages[1].content).toContain("Please send the report by Friday.");

      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionItems: [
                  { title: "Send the report", description: "Send the Q3 report", dueDate: null },
                ],
                events: [
                  {
                    title: "Planning sync",
                    description: "Quarterly planning sync",
                    date: "2026-09-10",
                    startTime: "09:00",
                    endTime: "10:00",
                  },
                ],
              }),
            },
          },
        ],
      });
    });

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      model: "some/model:free",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await extractor.extract(EMAIL);

    expect(result).toEqual({
      actionItems: [
        { title: "Send the report", description: "Send the Q3 report", dueDate: null },
      ],
      events: [
        {
          title: "Planning sync",
          description: "Quarterly planning sync",
          date: "2026-09-10",
          startTime: "09:00",
          endTime: "10:00",
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns empty arrays when the model reports no action items or events", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({ actionItems: [], events: [] }) } }],
      }),
    );

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await extractor.extract(EMAIL)).toEqual({ actionItems: [], events: [] });
  });

  it("throws when the chat completion request fails", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "invalid model" }, false, 400));

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("/chat/completions request failed");
  });

  it("strips a markdown code fence the model wrapped its JSON in despite being told not to", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: "```json\n" + JSON.stringify({ actionItems: [], events: [] }) + "\n```",
            },
          },
        ],
      }),
    );

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await extractor.extract(EMAIL)).toEqual({ actionItems: [], events: [] });
  });

  it("throws when the response content is not valid JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "not json" } }] }),
    );

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("not valid JSON");
  });

  it("throws when the response is missing an actionItems array", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: JSON.stringify({ events: [] }) } }] }),
    );

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("missing an actionItems array");
  });

  it("throws when the response is missing an events array", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionItems: [] }) } }] }),
    );

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("missing an events array");
  });

  it("defaults to OpenRouter's own free auto-router and OpenRouter's own base URL when neither is given", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody.model).toBe("openrouter/free");

      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ actionItems: [], events: [] }) } }],
      });
    });

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await extractor.extract(EMAIL);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries when a request fails, since the free auto-router can land on a different model each time", async () => {
    let callCount = 0;
    const fetchImpl = vi.fn(async () => {
      callCount += 1;
      if (callCount < 3) {
        // Mirrors what a real request to `openrouter/free` did in manual testing: routed to a
        // provider whose model rejected structured-output mode outright.
        return jsonResponse({ error: "model features structured outputs not support" }, false, 400);
      }
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ actionItems: [], events: [] }) } }],
      });
    });

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      model: "some/model:free",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(extractor.extract(EMAIL)).resolves.toEqual({ actionItems: [], events: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up and throws the last error once every retry has failed", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "still failing" }, false, 400));

    const extractor = createOpenRouterExtractor({
      apiKey: "test-api-key",
      model: "some/model:free",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(extractor.extract(EMAIL)).rejects.toThrow("/chat/completions request failed");
    // Exactly the retry budget, not more — a persistently-broken model shouldn't retry forever.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
