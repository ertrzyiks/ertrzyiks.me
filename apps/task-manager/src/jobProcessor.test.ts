import { describe, expect, it } from "vitest";
import type { EventEmitter, TrendEvent } from "./axiomEvents.js";
import { processEmailJob } from "./jobProcessor.js";
import type { EmailContent, EmailFetcher } from "./gmail.js";
import type { ActionItemExtractor } from "./lmStudio.js";
import type { ActionItem } from "./actionItem.js";

function recordingEmitter(): EventEmitter & { events: TrendEvent[] } {
  const events: TrendEvent[] = [];
  return { events, emit: (event) => events.push(event) };
}

function fakeFetcher(email: EmailContent): EmailFetcher {
  return {
    async fetchEmail(emailId) {
      expect(emailId).toBe(email.id);
      return email;
    },
  };
}

function failingFetcher(error: Error): EmailFetcher {
  return {
    async fetchEmail() {
      throw error;
    },
  };
}

function fakeExtractor(actionItems: ActionItem[]): ActionItemExtractor {
  return {
    async extract() {
      return actionItems;
    },
  };
}

function failingExtractor(error: Error): ActionItemExtractor {
  return {
    async extract() {
      throw error;
    },
  };
}

const EMAIL: EmailContent = {
  id: "email-1",
  subject: "Q3 planning",
  from: "boss@example.com",
  body: "Please send the report by Friday.",
};

const ACTION_ITEMS: ActionItem[] = [
  { title: "Send the report", description: "Send the Q3 report", dueDate: "2026-08-08" },
];

describe("processEmailJob", () => {
  it("fetches the email, extracts action items, and returns the job result shape", async () => {
    const result = await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor(ACTION_ITEMS),
    });

    expect(result).toEqual({ emailId: "email-1", actionItems: ACTION_ITEMS });
  });

  it("returns an empty actionItems array when none are found", async () => {
    const result = await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor([]),
    });

    expect(result).toEqual({ emailId: "email-1", actionItems: [] });
  });

  it("propagates an error when the email fetch fails, so BullMQ can mark the job failed", async () => {
    const error = new Error("Gmail API error");

    await expect(
      processEmailJob("email-1", {
        emailFetcher: failingFetcher(error),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
      }),
    ).rejects.toThrow("Gmail API error");
  });

  it("propagates an error when extraction fails, so BullMQ can mark the job failed", async () => {
    const error = new Error("LM Studio error");

    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: failingExtractor(error),
      }),
    ).rejects.toThrow("LM Studio error");
  });

  it("emits active then completed trend events, keyed by emailId (#315)", async () => {
    const events = recordingEmitter();

    await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor(ACTION_ITEMS),
      events,
    });

    expect(events.events).toEqual([
      { entity: "extract-action-items", entityId: "email-1", status: "active" },
      { entity: "extract-action-items", entityId: "email-1", status: "completed" },
    ]);
  });

  it("emits active then failed (with the error message) when the email fetch fails", async () => {
    const events = recordingEmitter();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: failingFetcher(new Error("boom")),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
        events,
      }),
    ).rejects.toThrow();

    expect(events.events).toEqual([
      { entity: "extract-action-items", entityId: "email-1", status: "active" },
      { entity: "extract-action-items", entityId: "email-1", status: "failed", error: "boom" },
    ]);
  });

  it("doesn't throw when no events dep is given — defaults to a no-op", async () => {
    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
      }),
    ).resolves.toBeDefined();
  });
});
