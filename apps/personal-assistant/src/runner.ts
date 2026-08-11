import { runPollCycle, type PollDeps } from "./poller.js";
import { Sentry } from "./sentry.js";

export interface Runner {
  stop(): void;
}

/**
 * Runs the poll cycle (discover+schedule, then poll pending job statuses) on a fixed interval.
 * Polling frequency and retry/alerting policy are explicitly deferred per #250 — a plain
 * setInterval loop with a sane default is a reasonable starting point, not a final design.
 *
 * Overlapping runs are skipped rather than queued: if a cycle is still in flight when the
 * next tick fires, the tick is a no-op.
 */
export function startPolling(deps: PollDeps, intervalMs: number): Runner {
  const logger = deps.logger;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runPollCycle(deps);
    } catch (err) {
      logger?.error(`poll cycle failed: ${err instanceof Error ? err.message : String(err)}`);
      // Unlike the per-email/per-action-item failures runPollCycle already swallows internally
      // (tracked via SQLite status + Axiom, not a bug signal) — reaching this catch means
      // something broke the whole cycle unexpectedly, which is exactly what Sentry should see.
      Sentry.captureException(err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  void tick();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
