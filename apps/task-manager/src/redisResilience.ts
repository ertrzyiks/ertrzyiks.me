// Shared "don't crash on a Redis blip" wiring for every BullMQ `Queue`/`Worker` in this app.
//
// BullMQ's `RedisConnection` always attaches its own `error` listener to the underlying ioredis
// client and re-emits the error as the wrapping `Queue`/`Worker`'s own `error` event. `Queue` and
// `Worker` are plain Node `EventEmitter`s, and Node throws synchronously when an `error` event
// has no listener — so, without this, any transient Redis disconnect (the Mac worker's network
// dropping, a Redis restart) crashes the whole process instead of the connection just
// reconnecting. ioredis's default `retryStrategy` already retries the underlying socket forever
// (paired everywhere with `maxRetriesPerRequest: null`, BullMQ's recommended setting for exactly
// this), so keeping the `error` event from being fatal is all that's needed: once the socket
// reconnects, BullMQ resumes consuming/producing on its own, no extra recovery logic required.
//
// Deliberately not routed through `Sentry.captureException` (see sentry.ts) the way
// `worker.on("failed", ...)` handlers are — an extended outage can fire this every retry attempt
// (every couple of seconds) while ioredis keeps trying, and Sentry's free-tier event quota
// shouldn't pay for that. A `failed` job (one Sentry event per job, capped by retry.ts's
// `attempts: 3`) already surfaces the same outage once it's over.
import type { WorkerLogger } from "./workerLogger.js";

export function logConnectionErrors(
  emitter: { on(event: "error", listener: (error: Error) => void): unknown },
  label: string,
  logger: WorkerLogger = console,
): void {
  emitter.on("error", (error) => {
    logger.error(`${label}: Redis connection error, will keep retrying:`, error);
  });
}
