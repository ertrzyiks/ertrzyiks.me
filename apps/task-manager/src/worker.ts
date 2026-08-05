// Mac worker entry point (#249). Separate from `server.ts`/`devServer.ts` — this is
// never deployed to Dokku, it only ever runs on the user's Mac via a LaunchAgent
// (#243), colocated here so it can share the `EmailJobPayload`/`EmailJobResult`/
// `ActionItem` types and `QUEUE_NAME` with the Jobs API server directly via import.
//
// Consumes the `extract-action-items` queue: for each job, fetches the email via
// the worker's own `gmail.readonly` credential (refresh token read from the macOS
// Keychain, see keychain.ts), extracts action items via a local LM Studio server
// (see lmStudio.ts), and returns `{ emailId, actionItems }` as the job result — or
// lets the error propagate so BullMQ marks the job `failed`.
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { EmailJobPayload, EmailJobResult } from "./actionItem.js";
import { createGmailFetcher, type EmailFetcher } from "./gmail.js";
import { macKeychainReader } from "./keychain.js";
import { createLmStudioExtractor, type ActionItemExtractor } from "./lmStudio.js";
import { processEmailJob } from "./jobProcessor.js";
import { QUEUE_NAME } from "./queue.js";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

const lmStudioBaseUrl = process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234";
const keychainAccount = process.env.GMAIL_KEYCHAIN_ACCOUNT ?? "task-manager-worker";
const keychainService = process.env.GMAIL_KEYCHAIN_SERVICE ?? "gmail-refresh-token";

// Escape hatch for manual smoke-testing against a real Redis/BullMQ queue in
// environments without macOS Keychain or a running LM Studio (e.g. this repo's
// Linux CI/sandbox) — swaps in canned, deterministic fakes instead of the real
// Gmail/LM Studio integrations. Never set in production; the LaunchAgent plist
// (#243) must not set this variable.
const useFakeDeps = process.env.WORKER_FAKE_DEPS === "true";

async function buildDependencies(): Promise<{
  emailFetcher: EmailFetcher;
  actionItemExtractor: ActionItemExtractor;
}> {
  if (useFakeDeps) {
    return {
      emailFetcher: {
        async fetchEmail(emailId) {
          // Also exercises the failure path in manual smoke tests: a real Gmail
          // fetch error would propagate the same way and BullMQ would mark the
          // job `failed` with it as `failedReason`.
          if (emailId === "trigger-fake-failure") {
            throw new Error("[fake] simulated Gmail fetch failure");
          }
          return {
            id: emailId,
            subject: "[fake] Q3 planning",
            from: "fake@example.com",
            body: "Please send the report by Friday.",
          };
        },
      },
      actionItemExtractor: {
        async extract() {
          return [
            {
              title: "Send the report",
              description: "Send the Q3 report as requested",
              dueDate: null,
            },
          ];
        },
      },
    };
  }

  const gmailClientId = process.env.GMAIL_CLIENT_ID;
  const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!gmailClientId) throw new Error("GMAIL_CLIENT_ID is required");
  if (!gmailClientSecret) throw new Error("GMAIL_CLIENT_SECRET is required");

  const refreshToken = await macKeychainReader.read(keychainAccount, keychainService);

  return {
    emailFetcher: createGmailFetcher({
      clientId: gmailClientId,
      clientSecret: gmailClientSecret,
      refreshToken,
    }),
    actionItemExtractor: createLmStudioExtractor({ baseUrl: lmStudioBaseUrl }),
  };
}

const { emailFetcher, actionItemExtractor } = await buildDependencies();

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker<EmailJobPayload, EmailJobResult>(
  QUEUE_NAME,
  async (job) => processEmailJob(job.data.emailId, { emailFetcher, actionItemExtractor }),
  { connection },
);

worker.on("ready", () => {
  console.log(`task-manager worker ready, consuming queue "${QUEUE_NAME}"`);
});

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id ?? "<unknown>"} failed:`, error);
});
