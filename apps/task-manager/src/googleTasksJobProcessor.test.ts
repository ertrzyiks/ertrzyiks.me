import { describe, expect, it } from "vitest";
import type { EventEmitter, TrendEvent } from "./axiomEvents.js";
import { processGoogleTaskJob } from "./googleTasksJobProcessor.js";
import type { GoogleTasksClient } from "./googleTasksClient.js";
import type { GoogleTaskJobPayload } from "./googleTask.js";

function recordingEmitter(): EventEmitter & { events: TrendEvent[] } {
  const events: TrendEvent[] = [];
  return { events, emit: (event) => events.push(event) };
}

function recordingLog(): { log: (message: string) => void; messages: string[] } {
  const messages: string[] = [];
  return { messages, log: (message) => messages.push(message) };
}

function fakeClient(id: string): GoogleTasksClient {
  return {
    async createTask() {
      return { id };
    },
  };
}

function failingClient(error: Error): GoogleTasksClient {
  return {
    async createTask() {
      throw error;
    },
  };
}

const PAYLOAD: GoogleTaskJobPayload = {
  actionItemId: 1,
  title: "Send the report",
  description: "Send the Q3 report",
  dueDate: "2026-08-08",
};

describe("processGoogleTaskJob", () => {
  it("creates the Google Task and returns the job result shape", async () => {
    const result = await processGoogleTaskJob(PAYLOAD, { googleTasksClient: fakeClient("gtask-1") });

    expect(result).toEqual({ actionItemId: 1, googleTaskId: "gtask-1" });
  });

  it("propagates an error when the Google Tasks API call fails, so BullMQ can mark the job failed", async () => {
    const error = new Error("Google Tasks API error");

    await expect(
      processGoogleTaskJob(PAYLOAD, { googleTasksClient: failingClient(error) }),
    ).rejects.toThrow("Google Tasks API error");
  });

  it("emits active then completed trend events, keyed by actionItemId (#315)", async () => {
    const events = recordingEmitter();

    await processGoogleTaskJob(PAYLOAD, { googleTasksClient: fakeClient("gtask-1"), events });

    expect(events.events).toEqual([
      { entity: "sync-google-tasks", entityId: "1", status: "active" },
      { entity: "sync-google-tasks", entityId: "1", status: "completed" },
    ]);
  });

  it("emits active then failed (with the error message) when the Google Tasks API call fails", async () => {
    const events = recordingEmitter();

    await expect(
      processGoogleTaskJob(PAYLOAD, { googleTasksClient: failingClient(new Error("boom")), events }),
    ).rejects.toThrow();

    expect(events.events).toEqual([
      { entity: "sync-google-tasks", entityId: "1", status: "active" },
      { entity: "sync-google-tasks", entityId: "1", status: "failed", error: "boom" },
    ]);
  });

  it("doesn't throw when no events dep is given — defaults to a no-op", async () => {
    await expect(
      processGoogleTaskJob(PAYLOAD, { googleTasksClient: fakeClient("gtask-1") }),
    ).resolves.toBeDefined();
  });

  it("leaves progress notes on success, for Bull Board's Logs tab (#348)", async () => {
    const { log, messages } = recordingLog();

    await processGoogleTaskJob(PAYLOAD, { googleTasksClient: fakeClient("gtask-1"), log });

    expect(messages).toEqual(['Creating Google Task "Send the report"', "Created Google Task gtask-1"]);
  });

  it("leaves a failure progress note when the Google Tasks API call fails", async () => {
    const { log, messages } = recordingLog();

    await expect(
      processGoogleTaskJob(PAYLOAD, { googleTasksClient: failingClient(new Error("boom")), log }),
    ).rejects.toThrow();

    expect(messages).toEqual(['Creating Google Task "Send the report"', "Failed: boom"]);
  });

  it("doesn't throw when no log dep is given — defaults to a no-op", async () => {
    await expect(
      processGoogleTaskJob(PAYLOAD, { googleTasksClient: fakeClient("gtask-1") }),
    ).resolves.toBeDefined();
  });
});
