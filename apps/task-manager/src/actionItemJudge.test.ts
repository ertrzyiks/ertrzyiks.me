import { describe, expect, it, vi } from "vitest";
import { createLmStudioActionItemJudge, noopActionItemJudge } from "./actionItemJudge.js";
import type { ActionItem } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";

// LM Studio is a real local server (localhost:1234) — nothing to talk to in
// CI/sandbox, so every test here injects a fake `fetch` via the `fetchImpl` seam
// rather than making a real HTTP call (see lmStudioClient.ts's LmStudioConfig comment).

const EMAIL: EmailContent = {
  id: "email-1",
  subject: "Q3 planning",
  from: "boss@example.com",
  body: "Please send the report by Friday.",
};

const ACTION_ITEM: ActionItem = {
  title: "Send the report",
  description: "Send the Q3 report",
  dueDate: "2026-08-14",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as Response;
}

describe("createLmStudioActionItemJudge", () => {
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
        expect(requestBody.response_format.json_schema.name).toBe("action_item_verdict");
        expect(requestBody.messages[1].content).toContain("Please send the report by Friday.");
        expect(requestBody.messages[1].content).toContain("Send the report");
        expect(requestBody.messages[1].content).toContain("2026-08-14");

        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({ keep: true, reason: "Grounded in an explicit request." }),
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${urlString}`);
    });

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const verdict = await judge.judge(EMAIL, ACTION_ITEM);

    expect(verdict).toEqual({ keep: true, reason: "Grounded in an explicit request." });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("renders an action item with no due date as '(none)' in the prompt", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody.messages[1].content).toContain("Due date: (none)");
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ keep: true, reason: "ok" }) } }],
      });
    });

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await judge.judge(EMAIL, { ...ACTION_ITEM, dueDate: null });
  });

  it("returns a reject verdict when the model says the item should be discarded", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ keep: false, reason: "Only a call-to-action link, not a real request." }),
            },
          },
        ],
      });
    });

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await judge.judge(EMAIL, ACTION_ITEM)).toEqual({
      keep: false,
      reason: "Only a call-to-action link, not a real request.",
    });
  });

  it("throws when no model is currently loaded in LM Studio", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(judge.judge(EMAIL, ACTION_ITEM)).rejects.toThrow("no model currently loaded");
  });

  it("throws when the /v1/models request fails", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 500));

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(judge.judge(EMAIL, ACTION_ITEM)).rejects.toThrow("/v1/models request failed");
  });

  it("throws when the chat completion request fails", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({}, false, 503);
    });

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(judge.judge(EMAIL, ACTION_ITEM)).rejects.toThrow("/v1/chat/completions request failed");
  });

  it("throws when the response content is not valid JSON", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({ choices: [{ message: { content: "not json" } }] });
    });

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(judge.judge(EMAIL, ACTION_ITEM)).rejects.toThrow("not valid JSON");
  });

  it("throws when the response is missing a boolean keep field", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ reason: "ok" }) } }] });
    });

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(judge.judge(EMAIL, ACTION_ITEM)).rejects.toThrow("missing a boolean keep field");
  });

  it("throws when the response is missing a reason field", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ keep: true }) } }] });
    });

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(judge.judge(EMAIL, ACTION_ITEM)).rejects.toThrow("missing a reason field");
  });

  it("defaults to http://localhost:1234 as the base URL", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ keep: true, reason: "ok" }) } }] });
    });

    const judge = createLmStudioActionItemJudge({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await judge.judge(EMAIL, ACTION_ITEM);

    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://localhost:1234/v1/models");
  });
});

describe("noopActionItemJudge", () => {
  it("always approves, so a missing dep never changes behavior", async () => {
    expect(await noopActionItemJudge.judge(EMAIL, ACTION_ITEM)).toEqual({
      keep: true,
      reason: "judging disabled",
    });
  });
});
