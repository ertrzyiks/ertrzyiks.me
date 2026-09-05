// Fire-and-forget trend-event emission to Axiom (#315) — historical/trend visibility over job
// status, supplementing (not replacing) Bull Board's live snapshot view. Emitted inline at each
// job's active/completed/failed transition (jobProcessor.ts/todoistJobProcessor.ts), mirroring
// how personal-assistant's poller.ts emits from its own store.ts call sites, rather than a
// separate BullMQ QueueEvents Redis-pubsub listener — simpler, no new listener lifecycle to
// manage, per #315's resolution.
//
// AXIOM_TOKEN/AXIOM_DATASET are plain, optional env vars like every other credential this service
// reads — an Axiom ingest token only grants write access to one dataset, a low blast radius even
// among those. Unset, `noopEventEmitter` is used instead — this feature is additive, never a hard
// requirement for the process to run.
export type TrendEventStatus = "queued" | "active" | "completed" | "failed";

export interface TrendEvent {
  entity: string;
  entityId: string;
  status: TrendEventStatus;
  error?: string;
}

export interface EventEmitter {
  /** Never throws or blocks the caller — fires the request and returns immediately. */
  emit(event: TrendEvent): void;
}

export const noopEventEmitter: EventEmitter = {
  emit() {},
};

export interface AxiomConfig {
  token: string;
  dataset: string;
  service: string;
  domain?: string;
  // Test seam — a fake `fetch` swapped in so the request shape can be asserted without a real
  // Axiom endpoint (mirrors openRouter.ts's OpenRouterConfig.fetchImpl).
  fetchImpl?: typeof fetch;
}

// The account's dataset lives on Axiom's EU region, behind its regional "edge" ingest endpoint —
// neither the default US host (api.axiom.co) nor the generic api.eu.axiom.co resolve it (both
// 404 "path not found"); this is the host Axiom's own dashboard gives for this org's region.
// Hardcoded rather than plumbed through env/terraform since there's only one account and it
// isn't expected to change regions.
const DEFAULT_DOMAIN = "eu-central-1.aws.edge.axiom.co";

export function createAxiomEventEmitter(config: AxiomConfig): EventEmitter {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `https://${config.domain ?? DEFAULT_DOMAIN}/v1/ingest/${config.dataset}`;

  return {
    emit(event) {
      // _time is Axiom's documented field for a caller-supplied event timestamp (ISO 8601) —
      // without it, Axiom stamps ingestion time instead, which would blur "when did this
      // actually happen" for a trends view during any ingest delay.
      const body = JSON.stringify([
        {
          _time: new Date().toISOString(),
          service: config.service,
          entity: event.entity,
          entityId: event.entityId,
          status: event.status,
          ...(event.error !== undefined ? { error: event.error } : {}),
        },
      ]);

      // Deliberately not awaited or returned: a slow/failed Axiom request must never delay or
      // fail the job pipeline this event is describing. Errors are only logged.
      fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body,
      })
        .then((res) => {
          if (!res.ok) {
            console.error(`Axiom ingest failed: ${res.status} ${res.statusText}`);
          }
        })
        .catch((error) => {
          console.error("Axiom ingest request failed:", error);
        });
    },
  };
}
