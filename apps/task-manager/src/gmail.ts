// Gmail message fetch, scoped to `gmail.readonly`. Only ever runs on the Mac
// worker (#249) — the orchestration service (#236) never imports this, it only
// ever handles message IDs.
import { OAuth2Client } from "google-auth-library";
import { google, type gmail_v1 } from "googleapis";

export interface EmailContent {
  id: string;
  subject: string;
  from: string;
  body: string;
}

export interface EmailFetcher {
  fetchEmail(emailId: string): Promise<EmailContent>;
}

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

// Real implementation — exchanges the refresh token (read from the macOS Keychain
// by the caller, see keychain.ts) for an access token via google-auth-library, then
// calls the Gmail API's messages.get endpoint via googleapis. This talks to real
// Google infrastructure so it cannot be exercised in CI/sandbox; `parseGmailMessage`
// below is the pure, unit-tested seam that covers the actual parsing logic.
export function createGmailFetcher(config: GmailOAuthConfig): EmailFetcher {
  const oauth2Client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  return {
    async fetchEmail(emailId: string): Promise<EmailContent> {
      const { data } = await gmail.users.messages.get({
        userId: "me",
        id: emailId,
        format: "full",
      });
      return parseGmailMessage(data);
    },
  };
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function findHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  const header = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? "";
}

function extractBody(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";

  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (part.parts) {
    const plainPart = part.parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
    if (plainPart?.body?.data) return decodeBase64Url(plainPart.body.data);

    for (const nested of part.parts) {
      const body = extractBody(nested);
      if (body) return body;
    }
  }

  if (part.body?.data) return decodeBase64Url(part.body.data);

  return "";
}

// Pure and independent of the googleapis client, so it's fully unit-testable
// against hand-built `gmail_v1.Schema$Message` fixtures.
export function parseGmailMessage(message: gmail_v1.Schema$Message): EmailContent {
  return {
    id: message.id ?? "",
    subject: findHeader(message.payload?.headers, "subject"),
    from: findHeader(message.payload?.headers, "from"),
    body: extractBody(message.payload) || message.snippet || "",
  };
}
