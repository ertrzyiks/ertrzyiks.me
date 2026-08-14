import { describe, expect, it } from "vitest";
import type { ActionItemJudge } from "./actionItemJudge.js";
import type { EventEmitter, TrendEvent } from "../../../../axiomEvents.js";
import { processEmailJob } from "./jobProcessor.js";
import type { EmailContent, EmailFetcher } from "./gmail.js";
import type { InspectionLogger, InspectionRecord } from "./inspectionLog.js";
import type { ActionItemExtractor } from "./lmStudio.js";
import type { ActionItem } from "./actionItem.js";

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

// Approves everything — matches the built-in noopActionItemJudge's behavior, so tests that need a
// judge dep in the call but don't care about filtering can use this instead.
function approvingJudge(): ActionItemJudge {
  return {
    async judge() {
      return { keep: true, reason: "looks right" };
    },
  };
}

// Rejects any action item whose title is in `rejectedTitles`, approving everything else — lets a
// test target exactly which of several extracted items gets filtered out.
function judgeRejecting(rejectedTitles: string[]): ActionItemJudge {
  return {
    async judge(_email, actionItem) {
      if (rejectedTitles.includes(actionItem.title)) {
        return { keep: false, reason: `rejected: ${actionItem.title}` };
      }
      return { keep: true, reason: "looks right" };
    },
  };
}

function failingJudge(error: Error): ActionItemJudge {
  return {
    async judge() {
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

const TWO_ACTION_ITEMS: ActionItem[] = [
  { title: "Send the report", description: "Send the Q3 report", dueDate: "2026-08-08" },
  { title: "Unsubscribe", description: "Follow the unsubscribe link", dueDate: null },
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

  it("doesn't throw when no inspectionLogger dep is given — defaults to a no-op", async () => {
    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: failingExtractor(new Error("boom")),
      }),
    ).rejects.toThrow("boom");
  });

  it("records the email content and action items to the inspection logger on success", async () => {
    const inspectionLogger = recordingInspectionLogger();

    await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor(ACTION_ITEMS),
      inspectionLogger,
    });

    expect(inspectionLogger.records).toEqual([
      { emailId: "email-1", email: EMAIL, actionItems: ACTION_ITEMS },
    ]);
  });

  it("records the email content and error to the inspection logger when extraction fails", async () => {
    const inspectionLogger = recordingInspectionLogger();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: failingExtractor(new Error("LM Studio error")),
        inspectionLogger,
      }),
    ).rejects.toThrow("LM Studio error");

    expect(inspectionLogger.records).toEqual([
      { emailId: "email-1", email: EMAIL, error: "LM Studio error" },
    ]);
  });

  it("doesn't record to the inspection logger when the email fetch itself fails", async () => {
    const inspectionLogger = recordingInspectionLogger();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: failingFetcher(new Error("Gmail API error")),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
        inspectionLogger,
      }),
    ).rejects.toThrow("Gmail API error");

    expect(inspectionLogger.records).toEqual([]);
  });

  it("doesn't throw when no actionItemJudge dep is given — defaults to keeping everything", async () => {
    const result = await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor(TWO_ACTION_ITEMS),
    });

    expect(result).toEqual({ emailId: "email-1", actionItems: TWO_ACTION_ITEMS });
  });

  it("drops action items the judge rejects from the returned result", async () => {
    const result = await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor(TWO_ACTION_ITEMS),
      actionItemJudge: judgeRejecting(["Unsubscribe"]),
    });

    expect(result).toEqual({
      emailId: "email-1",
      actionItems: [TWO_ACTION_ITEMS[0]],
    });
  });

  it("keeps every item when the judge approves all of them", async () => {
    const result = await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor(TWO_ACTION_ITEMS),
      actionItemJudge: approvingJudge(),
    });

    expect(result).toEqual({ emailId: "email-1", actionItems: TWO_ACTION_ITEMS });
  });

  it("records kept and rejected action items separately to the inspection logger", async () => {
    const inspectionLogger = recordingInspectionLogger();

    await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor(TWO_ACTION_ITEMS),
      actionItemJudge: judgeRejecting(["Unsubscribe"]),
      inspectionLogger,
    });

    expect(inspectionLogger.records).toEqual([
      {
        emailId: "email-1",
        email: EMAIL,
        actionItems: [TWO_ACTION_ITEMS[0]],
        rejectedActionItems: [
          { actionItem: TWO_ACTION_ITEMS[1], reason: "rejected: Unsubscribe" },
        ],
      },
    ]);
  });

  it("omits rejectedActionItems from the inspection record when nothing was rejected", async () => {
    const inspectionLogger = recordingInspectionLogger();

    await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor(ACTION_ITEMS),
      actionItemJudge: approvingJudge(),
      inspectionLogger,
    });

    expect(inspectionLogger.records).toEqual([
      { emailId: "email-1", email: EMAIL, actionItems: ACTION_ITEMS },
    ]);
  });

  it("propagates an error when judging fails, so BullMQ can mark the job failed", async () => {
    const error = new Error("LM Studio judge error");

    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
        actionItemJudge: failingJudge(error),
      }),
    ).rejects.toThrow("LM Studio judge error");
  });

  it("records the email content and error to the inspection logger when judging fails", async () => {
    const inspectionLogger = recordingInspectionLogger();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
        actionItemJudge: failingJudge(new Error("LM Studio judge error")),
        inspectionLogger,
      }),
    ).rejects.toThrow("LM Studio judge error");

    expect(inspectionLogger.records).toEqual([
      { emailId: "email-1", email: EMAIL, error: "LM Studio judge error" },
    ]);
  });

  it("emits failed (with the error message) when judging fails", async () => {
    const events = recordingEmitter();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
        actionItemJudge: failingJudge(new Error("boom")),
        events,
      }),
    ).rejects.toThrow();

    expect(events.events).toEqual([
      { entity: "extract-action-items", entityId: "email-1", status: "active" },
      { entity: "extract-action-items", entityId: "email-1", status: "failed", error: "boom" },
    ]);
  });

  it("never calls the judge when there are no action items to judge", async () => {
    let judgeCalls = 0;
    const judge: ActionItemJudge = {
      async judge() {
        judgeCalls += 1;
        return { keep: true, reason: "unreachable" };
      },
    };

    const result = await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor([]),
      actionItemJudge: judge,
    });

    expect(result).toEqual({ emailId: "email-1", actionItems: [] });
    expect(judgeCalls).toBe(0);
  });

  it("leaves progress notes on success, for Bull Board's Logs tab (#348)", async () => {
    const { log, messages } = recordingLog();

    await processEmailJob("email-1", {
      emailFetcher: fakeFetcher(EMAIL),
      actionItemExtractor: fakeExtractor(ACTION_ITEMS),
      log,
    });

    expect(messages).toEqual([
      "Fetching email email-1 from Gmail",
      'Extracting action items from "Q3 planning"',
      "Judging 1 extracted action item(s)",
      "Kept 1, rejected 0 action item(s)",
    ]);
  });

  it("leaves a failure progress note when the email fetch fails", async () => {
    const { log, messages } = recordingLog();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: failingFetcher(new Error("boom")),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
        log,
      }),
    ).rejects.toThrow();

    expect(messages).toEqual(["Fetching email email-1 from Gmail", "Failed: boom"]);
  });

  it("leaves a failure progress note when judging fails", async () => {
    const { log, messages } = recordingLog();

    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
        actionItemJudge: failingJudge(new Error("boom")),
        log,
      }),
    ).rejects.toThrow();

    expect(messages).toEqual([
      "Fetching email email-1 from Gmail",
      'Extracting action items from "Q3 planning"',
      "Judging 1 extracted action item(s)",
      "Failed: boom",
    ]);
  });

  it("doesn't throw when no log dep is given — defaults to a no-op", async () => {
    await expect(
      processEmailJob("email-1", {
        emailFetcher: fakeFetcher(EMAIL),
        actionItemExtractor: fakeExtractor(ACTION_ITEMS),
      }),
    ).resolves.toBeDefined();
  });
});
