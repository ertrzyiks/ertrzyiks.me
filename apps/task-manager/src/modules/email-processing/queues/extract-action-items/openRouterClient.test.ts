import { describe, expect, it, vi } from "vitest";
import { pickFreeModel } from "./openRouterClient.js";

// OpenRouter's real catalog (https://openrouter.ai/api/v1/models) has ~400 entries; these fixtures
// only carry the fields pickFreeModel actually reads, shaped after real free-tier entries seen
// there (see this file's header comment for why nothing here hardcodes a specific model id).
function catalogModel(overrides: {
  id: string;
  free?: boolean;
  outputsText?: boolean;
  structuredOutputs?: boolean;
  contextLength?: number;
}) {
  const { id, free = true, outputsText = true, structuredOutputs = true, contextLength = 128_000 } =
    overrides;
  return {
    id,
    context_length: contextLength,
    pricing: { prompt: free ? "0" : "0.000002", completion: free ? "0" : "0.000006" },
    architecture: { output_modalities: outputsText ? ["text"] : ["audio"] },
    supported_parameters: structuredOutputs
      ? ["response_format", "structured_outputs"]
      : ["response_format"],
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: ok ? "OK" : "Error", json: async () => body } as Response;
}

describe("pickFreeModel", () => {
  it("picks the free, text-output, structured-outputs-capable model with the largest context length", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/models");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

      return jsonResponse({
        data: [
          catalogModel({ id: "small/free-model", contextLength: 32_000 }),
          catalogModel({ id: "big/free-model", contextLength: 512_000 }),
          catalogModel({ id: "paid/expensive-model", free: false, contextLength: 1_000_000 }),
        ],
      });
    });

    const model = await pickFreeModel("https://openrouter.ai/api/v1", "test-key", fetchImpl as unknown as typeof fetch);

    expect(model).toBe("big/free-model");
  });

  it("excludes free models that don't output text", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          catalogModel({ id: "free/audio-model", outputsText: false, contextLength: 1_000_000 }),
          catalogModel({ id: "free/text-model", contextLength: 100_000 }),
        ],
      }),
    );

    const model = await pickFreeModel("https://openrouter.ai/api/v1", "test-key", fetchImpl as unknown as typeof fetch);

    expect(model).toBe("free/text-model");
  });

  it("falls back to a free text model without structured-outputs support when none declare it", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          catalogModel({ id: "free/basic-model", structuredOutputs: false, contextLength: 64_000 }),
        ],
      }),
    );

    const model = await pickFreeModel("https://openrouter.ai/api/v1", "test-key", fetchImpl as unknown as typeof fetch);

    expect(model).toBe("free/basic-model");
  });

  it("breaks ties on equal context length by id, so the same catalog always resolves the same model", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          catalogModel({ id: "z/model", contextLength: 128_000 }),
          catalogModel({ id: "a/model", contextLength: 128_000 }),
        ],
      }),
    );

    const model = await pickFreeModel("https://openrouter.ai/api/v1", "test-key", fetchImpl as unknown as typeof fetch);

    expect(model).toBe("a/model");
  });

  it("throws when no free text-output model exists in the catalog", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [catalogModel({ id: "paid/only-model", free: false })] }),
    );

    await expect(
      pickFreeModel("https://openrouter.ai/api/v1", "test-key", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow("no free text-output models");
  });

  it("throws when the /models request fails", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 503));

    await expect(
      pickFreeModel("https://openrouter.ai/api/v1", "test-key", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow("/models request failed");
  });

  it("treats a missing/unparseable price as not free rather than assuming it's free", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: "weird/no-pricing", architecture: { output_modalities: ["text"] } },
          catalogModel({ id: "free/normal-model", contextLength: 1_000 }),
        ],
      }),
    );

    const model = await pickFreeModel("https://openrouter.ai/api/v1", "test-key", fetchImpl as unknown as typeof fetch);

    expect(model).toBe("free/normal-model");
  });
});
