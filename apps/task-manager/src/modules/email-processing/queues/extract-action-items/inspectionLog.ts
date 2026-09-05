// Writes each extract-action-items run's email content and extracted action items to disk (#346
// follow-up) — on by default (`WORKER_INSPECTION_DIR` defaults to `./audit`, opt out with
// `WORKER_INSPECTION_DIR=""`), see server.ts. Bull Board (bullBoard.ts) only shows the final
// `EmailJobResult`, not the raw email body a run's action items were extracted from, which is
// what you need when judging whether an extraction — or a later regeneration of it, since a
// re-queued job for the same `emailId` runs through here again — actually got it right. Mirrors
// axiomEvents.ts's optional-dependency shape and its never-throws-or-blocks-the-caller contract;
// unlike Axiom this one defaults to *on*, so `noopInspectionLogger` only ever kicks in when a
// caller explicitly opts out.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ActionItem, CalendarEvent } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";

export interface InspectionRecord {
  emailId: string;
  email: EmailContent;
  // Exactly one of these branches is set — `actionItems`/`events` on a successful extraction,
  // `error` when the fetch or extraction step failed (see jobProcessor.ts's catch branch).
  actionItems?: ActionItem[];
  events?: CalendarEvent[];
  error?: string;
}

// What actually lands on disk — `recordedAt` is stamped by the logger itself, not the caller
// (mirrors Axiom's `_time`, see axiomEvents.ts), so consumers reading these files back (the
// `npm run review` UI, scripts/review-inspections.ts) can sort/display "when" without parsing it
// back out of the filename.
export interface StoredInspectionRecord extends InspectionRecord {
  recordedAt: string;
}

export interface InspectionLogger {
  /** Never throws or blocks the caller on a write failure — mirrors EventEmitter.emit. */
  record(entry: InspectionRecord): Promise<void>;
}

export const noopInspectionLogger: InspectionLogger = {
  async record() {},
};

// One JSON file per run (never overwritten) so repeated extractions/regenerations of the same
// email are preserved side by side instead of each clobbering the last — the whole point of this
// being an inspection trail rather than a "latest result" cache.
export function createFileInspectionLogger(dir: string): InspectionLogger {
  return {
    async record(entry) {
      try {
        await mkdir(dir, { recursive: true });
        const recordedAt = new Date().toISOString();
        // Colon/period-free so the filename is valid unmodified on every filesystem this worker
        // might run on (a local dev machine, whatever CI/sandbox runs the test suite, or the
        // Dokku container this queue's Worker actually runs in — see server.ts).
        const timestamp = recordedAt.replace(/[:.]/g, "-");
        // A random suffix, not just the timestamp, so two runs of the same email within the same
        // millisecond (seen in tests, and plausible for a quick manual regeneration) still land
        // in separate files instead of one silently overwriting the other.
        const suffix = randomBytes(4).toString("hex");
        const path = join(dir, `${timestamp}-${suffix}-${entry.emailId}.json`);
        const stored: StoredInspectionRecord = { ...entry, recordedAt };
        await writeFile(path, JSON.stringify(stored, null, 2), "utf8");
      } catch (error) {
        // Best-effort only — a disk/permission problem here must never fail the job it's
        // describing, same rationale as the Axiom emit() catch in axiomEvents.ts.
        console.error("Failed to write inspection log:", error);
      }
    },
  };
}
