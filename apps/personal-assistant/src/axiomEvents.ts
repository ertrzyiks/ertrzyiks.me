// Fire-and-forget trend-event emission to Axiom (#315) — historical/trend visibility over email
// status, supplementing (not replacing) the snapshot dashboard (healthServer.ts). Emitted inline
// at each of poller.ts's existing store.ts call sites (insertQueuedEmail/markEmailCompleted/
// markEmailFailed), mirroring task-manager's approach in jobProcessor.ts/todoistJobProcessor.ts.
import { noopLogger, type Logger } from "./logger.js";

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
  logger?: Logger;
  // Test seam — a fake `fetch` swapped in so the request shape can be asserted without a real
  // Axiom endpoint.
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
  const logger = config.logger ?? noopLogger;
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
      // fail the poll cycle this event is describing. Errors are only logged.
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
            logger.error(`Axiom ingest failed: ${res.status} ${res.statusText}`);
          }
        })
        .catch((error) => {
          logger.error(`Axiom ingest request failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    },
  };
}
