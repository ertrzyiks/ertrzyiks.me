// Thin seam so BullMQ-agnostic processor functions (jobProcessor.ts, todoistJobProcessor.ts,
// libraryRefresh.ts, loanCalendarSync.ts) can leave progress notes on the job they're running
// as — visible in Bull Board's per-job "Logs" tab — without depending on bullmq's `Job` type
// directly. Mirrors axiomEvents.ts's `EventEmitter` seam: optional on every processor's deps,
// defaults to a no-op so existing callers/tests are unaffected by omitting it.
//
// Bull Board's Logs tab was empty before this (#348) not because logging was broken, but because
// nothing ever called BullMQ's `Job#log()` — the processor functions only ever saw plain payloads
// (an emailId, a holdingId, ...), never the `Job` object `.log()` lives on. `jobLoggerFor` below
// is the adapter worker.ts/server.ts use to bridge the real `Job` into that seam.
export type JobLogger = (message: string) => void;

export const noopJobLogger: JobLogger = () => {};

// Minimal shape of BullMQ's `Job` this needs — matches its real `log(logRow: string):
// Promise<number>` signature without importing bullmq into this otherwise dependency-free file.
interface LoggableJob {
  log(logRow: string): Promise<number>;
}

// Fire-and-forget, like EventEmitter#emit — a job-log write is an append to a Redis list purely
// for operator visibility, so it must never delay or fail the job pipeline it's describing.
// Errors are only logged, matching axiomEvents.ts's treatment of a failed Axiom request.
export function jobLoggerFor(job: LoggableJob): JobLogger {
  return (message) => {
    job.log(message).catch((error) => {
      console.error("job.log failed:", error);
    });
  };
}
