// Mac worker entry point (#249). Separate from `server.ts` — this is
// never deployed to Dokku, it only ever runs on the user's Mac via a LaunchAgent
// (#243), colocated here so it can share the `EmailJobPayload`/`EmailJobResult`/
// `ActionItem` types and `QUEUE_NAME` with the Jobs API server directly via import.
//
// Consumes the `extract-action-items` queue: for each job, fetches the email via
// the worker's own `gmail.readonly` credential (refresh token read from the macOS
// Keychain, see keychain.ts), extracts action items via a local LM Studio server
// (see lmStudio.ts), and returns `{ emailId, actionItems }` as the job result — or
// lets the error propagate so BullMQ marks the job `failed`.
//
// In production this file isn't run directly — scripts/release-worker.mjs bundles
// and packages it into a standalone executable (dist-bin/task-manager-worker) so the
// Keychain ACL granted to it (see that script) can be scoped to this one program
// instead of to every script the machine's shared `node` binary ever runs. Startup
// is wrapped in `main()` rather than a top-level `await` for that bundler's sake —
// esbuild/pkg's module loader has spottier support for top-level await than plain
// `node dist/worker.js` (still how this file runs in local/CI dev, see README) does.
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { EmailJobPayload, EmailJobResult } from "./actionItem.js";
import { createAxiomEventEmitter, noopEventEmitter, type EventEmitter } from "./axiomEvents.js";
import { createGmailFetcher, type EmailFetcher } from "./gmail.js";
import { macKeychainReader, resolveSecret } from "./keychain.js";
import { createLmStudioExtractor, type ActionItemExtractor } from "./lmStudio.js";
import { processEmailJob } from "./jobProcessor.js";
import { QUEUE_NAME } from "./queue.js";

// Shared Keychain service for every secret this worker reads (refresh token, Redis
// URL, Gmail OAuth client id/secret) — all provisioned under the same service by
// scripts/release-worker.mjs, see its SECRETS manifest for the per-item account names.
const keychainService = process.env.GMAIL_KEYCHAIN_SERVICE ?? "task-manager-worker";
const gmailKeychainAccount = process.env.GMAIL_KEYCHAIN_ACCOUNT ?? "gmail-refresh-token";

const lmStudioBaseUrl = process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234";

// Plain, optional env vars (not Keychain-backed like the secrets above) — see axiomEvents.ts's
// header comment for why an Axiom ingest token doesn't need the same treatment. Unset (the
// LaunchAgent plist sets no EnvironmentVariables at all, see README's "macOS LaunchAgent"
// section), trend-event emission (#315) is just a no-op; nothing else about the worker changes.
const axiomToken = process.env.AXIOM_TOKEN;
const axiomDataset = process.env.AXIOM_DATASET;
const events: EventEmitter =
  axiomToken && axiomDataset
    ? createAxiomEventEmitter({ token: axiomToken, dataset: axiomDataset, service: "task-manager" })
    : noopEventEmitter;

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

  const gmailClientId = await resolveSecret(
    macKeychainReader,
    "gmail-client-id",
    keychainService,
    "GMAIL_CLIENT_ID",
  );
  const gmailClientSecret = await resolveSecret(
    macKeychainReader,
    "gmail-client-secret",
    keychainService,
    "GMAIL_CLIENT_SECRET",
  );
  const refreshToken = await resolveSecret(
    macKeychainReader,
    gmailKeychainAccount,
    keychainService,
    "GMAIL_REFRESH_TOKEN",
  );

  return {
    emailFetcher: createGmailFetcher({
      clientId: gmailClientId,
      clientSecret: gmailClientSecret,
      refreshToken,
    }),
    actionItemExtractor: createLmStudioExtractor({ baseUrl: lmStudioBaseUrl }),
  };
}

async function main() {
  // Real Redis is required regardless of WORKER_FAKE_DEPS — only the Gmail/LM Studio
  // integrations get faked, BullMQ always needs somewhere real to consume jobs from.
  const redisUrl = await resolveSecret(macKeychainReader, "redis-url", keychainService, "REDIS_URL");

  const { emailFetcher, actionItemExtractor } = await buildDependencies();

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<EmailJobPayload, EmailJobResult>(
    QUEUE_NAME,
    async (job) => processEmailJob(job.data.emailId, { emailFetcher, actionItemExtractor, events }),
    { connection },
  );

  worker.on("ready", () => {
    console.log(`task-manager worker ready, consuming queue "${QUEUE_NAME}"`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Job ${job?.id ?? "<unknown>"} failed:`, error);
  });
}

main().catch((error) => {
  // A non-zero exit here is what makes launchd's KeepAlive restart the worker
  // (subject to its default crash-loop throttling) instead of it silently dying.
  console.error("task-manager worker failed to start:", error);
  process.exit(1);
});
