import { describe, expect, it } from "vitest";
import type { gmail_v1 } from "googleapis";
import { createGmailClient } from "./gmailClient.js";

const CONFIG = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};

function fakeGmailApi(
  listImpl: (params: unknown) => Promise<{ data: gmail_v1.Schema$ListMessagesResponse }>,
): gmail_v1.Gmail {
  return {
    users: {
      messages: {
        list: listImpl,
      },
    },
  } as unknown as gmail_v1.Gmail;
}

describe("createGmailClient", () => {
  it("maps the messages.list response to an array of message IDs", async () => {
    const gmailApi = fakeGmailApi(async () => ({
      data: { messages: [{ id: "msg-1" }, { id: "msg-2" }] },
    }));
    const client = createGmailClient(CONFIG, gmailApi);

    await expect(client.listNewMessageIds()).resolves.toEqual(["msg-1", "msg-2"]);
  });

  it("returns an empty array when the mailbox has no messages", async () => {
    const gmailApi = fakeGmailApi(async () => ({ data: {} }));
    const client = createGmailClient(CONFIG, gmailApi);

    await expect(client.listNewMessageIds()).resolves.toEqual([]);
  });

  it("filters out entries with no id", async () => {
    const gmailApi = fakeGmailApi(async () => ({
      data: { messages: [{ id: "msg-1" }, { threadId: "thread-only" }] },
    }));
    const client = createGmailClient(CONFIG, gmailApi);

    await expect(client.listNewMessageIds()).resolves.toEqual(["msg-1"]);
  });

  it("requests userId 'me' and defaults maxResults to 50", async () => {
    let capturedParams: unknown;
    const gmailApi = fakeGmailApi(async (params) => {
      capturedParams = params;
      return { data: { messages: [] } };
    });
    const client = createGmailClient(CONFIG, gmailApi);

    await client.listNewMessageIds();

    expect(capturedParams).toEqual({ userId: "me", maxResults: 50 });
  });

  it("honors a configured maxResults", async () => {
    let capturedParams: unknown;
    const gmailApi = fakeGmailApi(async (params) => {
      capturedParams = params;
      return { data: { messages: [] } };
    });
    const client = createGmailClient({ ...CONFIG, maxResults: 10 }, gmailApi);

    await client.listNewMessageIds();

    expect(capturedParams).toEqual({ userId: "me", maxResults: 10 });
  });
});
