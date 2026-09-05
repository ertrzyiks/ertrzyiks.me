import { describe, expect, it } from "vitest";
import type { EventEmitter, TrendEvent } from "../../../../axiomEvents.js";
import { processEmailJob } from "./jobProcessor.js";
import type { EmailContent, EmailFetcher } from "./gmail.js";
import type { InspectionLogger, InspectionRecord } from "./inspectionLog.js";
import type { ActionItemExtractor, ExtractionResult } from "./openRouter.js";
import type { ActionItem, CalendarEvent } from "./actionItem.js";

function recordingEmitter(): EventEmitter & { events: TrendEvent[] } {
  const events: TrendEvent[] = [];
  return { events, emit: (event) => events.push(event) };
}

function recordingInspectionLogger(): InspectionLogger & { records: InspectionRecord[] } {
  const records: InspectionRecord[] = [];
  return {
    records,
    record: async (entry) => {
      records.push(entry);
    },
  };
}

function recordingLog(): { log: (message: string) => void; messages: string[] } {
  const messages: string[] = [];
  return { messages, log: (message) => messages.push(message) };
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

function fakeExtractor(result: Partial<ExtractionResult>): ActionItemExtractor {
  return {
    async extract() {
      return { actionItems: result.actionItems ?? [], events: result.events ?? [] };
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

const EVENTS: CalendarEvent[] = [
  {
    title: "Team offsite",
    description: "Quarterly offsite",
    date: "2026-09-10",
    startTime: "09:00",
    endTime: "17:00",
  },
];

describe("processEmailJob", () => {
  it("fetches the email, extracts action items and events, and returns the job result shape", async () => {
    const result = await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS, events: EVENTS }),
    });

    expect(result).toEqual({ emailId: "email-1", actionItems: ACTION_ITEMS, events: EVENTS });
  });

  it("returns empty actionItems/events arrays when none are found", async () => {
    const result = await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor({}),
    });

    expect(result).toEqual({ emailId: "email-1", actionItems: [], events: [] });
  });

  it("propagates an error when the email fetch fails, so BullMQ can mark the job failed", async () => {
    const error = new Error("Gmail API error");

    await expect(
      processEmailJob("email-1", {
        emailFetcher: failingFetcher(error),
        actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS }),
      }),
    ).rejects.toThrow("Gmail API error");
  });

  it("propagates an error when extraction fails, so BullMQ can mark the job failed", async () => {
    const error = new Error("OpenRouter error");

    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: failingExtractor(error),
      }),
    ).rejects.toThrow("OpenRouter error");
  });

  it("emits active then completed trend events, keyed by emailId (#315)", async () => {
    const events = recordingEmitter();

    await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS }),
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
        actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS }),
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
        actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS }),
      }),
    ).resolves.toBeDefined();
  });

  it("doesn't throw when no inspectionLogger dep is given — defaults to a no-op", async () => {
    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: failingExtractor(new Error("boom")),
      }),
    ).rejects.toThrow("boom");
  });

  it("records the email content, action items, and events to the inspection logger on success", async () => {
    const inspectionLogger = recordingInspectionLogger();

    await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS, events: EVENTS }),
      inspectionLogger,
    });

    expect(inspectionLogger.records).toEqual([
      { emailId: "email-1", email: EMAIL, actionItems: ACTION_ITEMS, events: EVENTS },
    ]);
  });

  it("records the email content and error to the inspection logger when extraction fails", async () => {
    const inspectionLogger = recordingInspectionLogger();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: failingExtractor(new Error("OpenRouter error")),
        inspectionLogger,
      }),
    ).rejects.toThrow("OpenRouter error");

    expect(inspectionLogger.records).toEqual([
      { emailId: "email-1", email: EMAIL, error: "OpenRouter error" },
    ]);
  });

  it("doesn't record to the inspection logger when the email fetch itself fails", async () => {
    const inspectionLogger = recordingInspectionLogger();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: failingFetcher(new Error("Gmail API error")),
        actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS }),
        inspectionLogger,
      }),
    ).rejects.toThrow("Gmail API error");

    expect(inspectionLogger.records).toEqual([]);
  });

  it("leaves progress notes on success, for Bull Board's Logs tab (#348)", async () => {
    const { log, messages } = recordingLog();

    await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS, events: EVENTS }),
      log,
    });

    expect(messages).toEqual([
      "Fetching email email-1 from Gmail",
      'Extracting action items and events from "Q3 planning"',
      "Extracted 1 action item(s) and 1 event(s)",
    ]);
  });

  it("leaves a failure progress note when the email fetch fails", async () => {
    const { log, messages } = recordingLog();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: failingFetcher(new Error("boom")),
        actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS }),
        log,
      }),
    ).rejects.toThrow();

    expect(messages).toEqual(["Fetching email email-1 from Gmail", "Failed: boom"]);
  });

  it("leaves a failure progress note when extraction fails", async () => {
    const { log, messages } = recordingLog();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: failingExtractor(new Error("boom")),
        log,
      }),
    ).rejects.toThrow();

    expect(messages).toEqual([
      "Fetching email email-1 from Gmail",
      'Extracting action items and events from "Q3 planning"',
      "Failed: boom",
    ]);
  });

  it("doesn't throw when no log dep is given — defaults to a no-op", async () => {
    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: fakeExtractor({ actionItems: ACTION_ITEMS }),
      }),
    ).resolves.toBeDefined();
  });
});
