import { google, type gmail_v1 } from "googleapis";

export interface GmailClient {
  /** Message IDs currently in the mailbox (most recent page only — see maxResults). */
  listNewMessageIds(): Promise<string[]>;
}

export interface GmailClientConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  maxResults?: number;
}

function buildGmailApi(config: GmailClientConfig): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
  auth.setCredentials({ refresh_token: config.refreshToken });
  return google.gmail({ version: "v1", auth });
}

/**
 * Wraps the Gmail API using the shared `gmail.readonly` credential (see #236/#247).
 *
 * IMPORTANT: this credential is scoped broadly enough to read message content, but this
 * service must never call a content-fetching endpoint (messages.get, messages.attachments.get,
 * etc.) — only messages.list, which returns IDs/threadIds and no message content. Content
 * extraction is the Mac worker's job (#249), running entirely locally.
 *
 * `gmailApi` is an injectable seam so callers can pass a fake in tests without touching real
 * Gmail OAuth.
 */
export function createGmailClient(
  config: GmailClientConfig,
  gmailApi: gmail_v1.Gmail = buildGmailApi(config),
): GmailClient {
  return {
    async listNewMessageIds() {
      const response = await gmailApi.users.messages.list({
        userId: "me",
        maxResults: config.maxResults ?? 50,
      });

      return (response.data.messages ?? [])
        .map((message) => message.id)
        .filter((id): id is string => Boolean(id));
    },
  };
}
