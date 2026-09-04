import { describe, expect, it } from "vitest";
import type { EventEmitter, TrendEvent } from "../../../../axiomEvents.js";
import { processTodoistJob } from "./todoistJobProcessor.js";
import type { TodoistClient } from "./todoistClient.js";
import type { TodoistJobPayload } from "./todoistTask.js";

function recordingEmitter(): EventEmitter & { events: TrendEvent[] } {
  const events: TrendEvent[] = [];
  return { events, emit: (event) => events.push(event) };
}

function recordingLog(): { log: (message: string) => void; messages: string[] } {
  const messages: string[] = [];
  return { messages, log: (message) => messages.push(message) };
}

function fakeClient(id: string): TodoistClient {
  return {
    async createTask() {
      return { id };
    },
  };
}

function failingClient(error: Error): TodoistClient {
  return {
    async createTask() {
      throw error;
    },
  };
}

const PAYLOAD: TodoistJobPayload = {
  actionItemId: 1,
  title: "Send the report",
  description: "Send the Q3 report",
  dueDate: "2026-08-08",
};

describe("processTodoistJob", () => {
  it("creates the Todoist task and returns the job result shape", async () => {
    const result = await processTodoistJob(PAYLOAD, { todoistClient: fakeClient("todoist-1") });

    expect(result).toEqual({ actionItemId: 1, todoistTaskId: "todoist-1" });
  });

  it("propagates an error when the Todoist API call fails, so BullMQ can mark the job failed", async () => {
    const error = new Error("Todoist API error");

    await expect(
      processTodoistJob(PAYLOAD, { todoistClient: failingClient(error) }),
    ).rejects.toThrow("Todoist API error");
  });

  it("emits active then completed trend events, keyed by actionItemId (#315)", async () => {
    const events = recordingEmitter();

    await processTodoistJob(PAYLOAD, { todoistClient: fakeClient("todoist-1"), events });

    expect(events.events).toEqual([
      { entity: "sync-todoist", entityId: "1", status: "active" },
      { entity: "sync-todoist", entityId: "1", status: "completed" },
    ]);
  });

  it("emits active then failed (with the error message) when the Todoist API call fails", async () => {
    const events = recordingEmitter();

    await expect(
      processTodoistJob(PAYLOAD, { todoistClient: failingClient(new Error("boom")), events }),
    ).rejects.toThrow();

    expect(events.events).toEqual([
      { entity: "sync-todoist", entityId: "1", status: "active" },
      { entity: "sync-todoist", entityId: "1", status: "failed", error: "boom" },
    ]);
  });

  it("doesn't throw when no events dep is given — defaults to a no-op", async () => {
    await expect(
      processTodoistJob(PAYLOAD, { todoistClient: fakeClient("todoist-1") }),
    ).resolves.toBeDefined();
  });

  it("leaves progress notes on success, for Bull Board's Logs tab (#348)", async () => {
    const { log, messages } = recordingLog();

    await processTodoistJob(PAYLOAD, { todoistClient: fakeClient("todoist-1"), log });

    expect(messages).toEqual(['Creating Todoist task "Send the report"', "Created Todoist task todoist-1"]);
  });

  it("leaves a failure progress note when the Todoist API call fails", async () => {
    const { log, messages } = recordingLog();

    await expect(
      processTodoistJob(PAYLOAD, { todoistClient: failingClient(new Error("boom")), log }),
    ).rejects.toThrow();

    expect(messages).toEqual(['Creating Todoist task "Send the report"', "Failed: boom"]);
  });

  it("doesn't throw when no log dep is given — defaults to a no-op", async () => {
    await expect(
      processTodoistJob(PAYLOAD, { todoistClient: fakeClient("todoist-1") }),
    ).resolves.toBeDefined();
  });
});
