import { describe, expect, it, vi } from "vitest";
import { createLmStudioExtractor } from "./lmStudio.js";
import type { EmailContent } from "./gmail.js";

// LM Studio is a real local server (localhost:1234) — nothing to talk to in
// CI/sandbox, so every test here injects a fake `fetch` via the `fetchImpl` seam
// rather than making a real HTTP call (see lmStudio.ts's LmStudioConfig comment).

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
  } as Response;
}

describe("createLmStudioExtractor", () => {
  it("queries /v1/models for the loaded model id, then posts a structured chat completion request", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const urlString = String(url);
      if (urlString.endsWith("/v1/models")) {
        return jsonResponse({ data: [{ id: "some-loaded-model" }] });
      }
      if (urlString.endsWith("/v1/chat/completions")) {
        const requestBody = JSON.parse(String(init?.body));
        expect(requestBody.model).toBe("some-loaded-model");
        expect(requestBody.response_format.type).toBe("json_schema");
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
      }
      throw new Error(`Unexpected URL: ${urlString}`);
    });

    const extractor = createLmStudioExtractor({ fetchImpl: fetchImpl as unknown as typeof fetch });
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
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns empty arrays when the model reports no action items or events", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ actionItems: [], events: [] }) } }],
      });
    });

    const extractor = createLmStudioExtractor({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await extractor.extract(EMAIL)).toEqual({ actionItems: [], events: [] });
  });

  it("throws when no model is currently loaded in LM Studio", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));

    const extractor = createLmStudioExtractor({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("no model currently loaded");
  });

  it("throws when the /v1/models request fails", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 500));

    const extractor = createLmStudioExtractor({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("/v1/models request failed");
  });

  it("throws when the chat completion request fails", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({}, false, 503);
    });

    const extractor = createLmStudioExtractor({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("/v1/chat/completions request failed");
  });

  it("throws when the response content is not valid JSON", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({ choices: [{ message: { content: "not json" } }] });
    });

    const extractor = createLmStudioExtractor({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("not valid JSON");
  });

  it("throws when the response is missing an actionItems array", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ events: [] }) } }],
      });
    });

    const extractor = createLmStudioExtractor({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("missing an actionItems array");
  });

  it("throws when the response is missing an events array", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ actionItems: [] }) } }],
      });
    });

    const extractor = createLmStudioExtractor({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(extractor.extract(EMAIL)).rejects.toThrow("missing an events array");
  });

  it("defaults to http://localhost:1234 as the base URL", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ actionItems: [], events: [] }) } }],
      });
    });

    const extractor = createLmStudioExtractor({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await extractor.extract(EMAIL);

    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://localhost:1234/v1/models");
  });
});
