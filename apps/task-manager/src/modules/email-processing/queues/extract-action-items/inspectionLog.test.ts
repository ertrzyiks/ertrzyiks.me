import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionItem, CalendarEvent } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";
import { createFileInspectionLogger, noopInspectionLogger } from "./inspectionLog.js";

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

describe("noopInspectionLogger", () => {
  it("resolves without doing anything", async () => {
    await expect(
      noopInspectionLogger.record({ emailId: "email-1", email: EMAIL, actionItems: ACTION_ITEMS }),
    ).resolves.toBeUndefined();
  });
});

describe("createFileInspectionLogger", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "inspection-log-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the email content, action items, and events to a JSON file in the given directory", async () => {
    const logger = createFileInspectionLogger(dir);

    await logger.record({ emailId: "email-1", email: EMAIL, actionItems: ACTION_ITEMS, events: EVENTS });

    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("email-1");
    expect(files[0]).toMatch(/\.json$/);

    const contents = JSON.parse(await readFile(join(dir, files[0]), "utf8"));
    expect(contents).toMatchObject({
      emailId: "email-1",
      email: EMAIL,
      actionItems: ACTION_ITEMS,
      events: EVENTS,
    });
    expect(typeof contents.recordedAt).toBe("string");
    expect(new Date(contents.recordedAt).toString()).not.toBe("Invalid Date");
  });

  it("writes the error instead when given one, e.g. after a failed extraction", async () => {
    const logger = createFileInspectionLogger(dir);

    await logger.record({ emailId: "email-1", email: EMAIL, error: "OpenRouter error" });

    const files = await readdir(dir);
    const contents = JSON.parse(await readFile(join(dir, files[0]), "utf8"));
    expect(contents).toMatchObject({ emailId: "email-1", email: EMAIL, error: "OpenRouter error" });
  });

  it("creates the directory if it doesn't exist yet", async () => {
    const nested = join(dir, "nested", "inspection");
    const logger = createFileInspectionLogger(nested);

    await logger.record({ emailId: "email-1", email: EMAIL, actionItems: ACTION_ITEMS });

    const files = await readdir(nested);
    expect(files).toHaveLength(1);
  });

  it("writes one file per run rather than overwriting, so repeated regenerations are all kept", async () => {
    const logger = createFileInspectionLogger(dir);

    await logger.record({ emailId: "email-1", email: EMAIL, actionItems: ACTION_ITEMS });
    await logger.record({ emailId: "email-1", email: EMAIL, actionItems: [] });

    const files = await readdir(dir);
    expect(files).toHaveLength(2);
  });
});
