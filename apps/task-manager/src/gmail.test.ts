import { describe, expect, it } from "vitest";
import type { gmail_v1 } from "googleapis";
import { parseGmailMessage } from "./gmail.js";

function b64url(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64url");
}

function header(name: string, value: string): gmail_v1.Schema$MessagePartHeader {
  return { name, value };
}

describe("parseGmailMessage", () => {
  it("extracts id, subject, from, and a plain-text body", () => {
    const message: gmail_v1.Schema$Message = {
      id: "msg-1",
      snippet: "fallback snippet",
      payload: {
        headers: [header("Subject", "Q3 planning"), header("From", "boss@example.com")],
        mimeType: "text/plain",
        body: { data: b64url("Please send the report by Friday.") },
      },
    };

    expect(parseGmailMessage(message)).toEqual({
      id: "msg-1",
      subject: "Q3 planning",
      from: "boss@example.com",
      body: "Please send the report by Friday.",
    });
  });

  it("picks the text/plain part out of a multipart message", () => {
    const message: gmail_v1.Schema$Message = {
      id: "msg-2",
      payload: {
        headers: [header("Subject", "Multipart"), header("From", "a@b.com")],
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/html", body: { data: b64url("<p>hi</p>") } },
          { mimeType: "text/plain", body: { data: b64url("hi in plain text") } },
        ],
      },
    };

    expect(parseGmailMessage(message).body).toBe("hi in plain text");
  });

  it("recurses into nested multipart parts to find plain text", () => {
    const message: gmail_v1.Schema$Message = {
      id: "msg-3",
      payload: {
        headers: [],
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [{ mimeType: "text/plain", body: { data: b64url("nested body") } }],
          },
        ],
      },
    };

    expect(parseGmailMessage(message).body).toBe("nested body");
  });

  it("falls back to the snippet when no text/plain part is found", () => {
    const message: gmail_v1.Schema$Message = {
      id: "msg-4",
      snippet: "fallback snippet",
      payload: {
        headers: [],
        mimeType: "text/html",
        body: { data: b64url("<p>only html</p>") },
      },
    };

    // The html-only body.data path isn't a text/plain match at the top level,
    // and there's no `parts`, so extractBody falls through to `part.body?.data`.
    // Only when *that's* also absent does the snippet kick in — cover both.
    expect(parseGmailMessage(message).body).toBe("<p>only html</p>");

    const withoutBody: gmail_v1.Schema$Message = {
      id: "msg-5",
      snippet: "fallback snippet",
      payload: { headers: [], mimeType: "text/html" },
    };
    expect(parseGmailMessage(withoutBody).body).toBe("fallback snippet");
  });

  it("handles missing headers and payload gracefully", () => {
    const message: gmail_v1.Schema$Message = { id: "msg-6" };

    expect(parseGmailMessage(message)).toEqual({
      id: "msg-6",
      subject: "",
      from: "",
      body: "",
    });
  });
});
