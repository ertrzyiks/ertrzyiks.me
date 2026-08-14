// Minimal logging seam every queue's worker.ts factory accepts for its "ready"/"failed" (and, for
// refresh-library-loans, its per-run summary) messages — satisfied by both plain `console` (the
// default, used by the Mac LaunchAgent entrypoint) and Fastify's pino-backed `app.log` (passed in
// by server.ts for the queues that run there), without tying every factory's signature to either
// one specifically.
export interface WorkerLogger {
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
