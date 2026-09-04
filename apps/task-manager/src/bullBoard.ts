import type { Queue } from "bullmq";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import type { FastifyInstance } from "fastify";

export const BULL_BOARD_BASE_PATH = "/admin/queues";

/**
 * Mounts the Bull Board queue-inspection UI onto an existing Fastify instance.
 *
 * Needs concrete BullMQ `Queue`s (not the `JobsQueue`/`TodoistJobsQueue` seams used by
 * `createApp`) to introspect job state — `server.ts` already builds them via `createQueue()`
 * (or, for the two library queues, `createLibraryRefreshQueue`/`createLibrarySyncQueue`), so
 * they're passed straight through rather than re-derived here. One board covers
 * `extract-action-items` (consumed by the Mac worker, worker.ts — not this process),
 * `sync-todoist`, `refresh-library-loans`, and `sync-loan-calendar` (the latter two only
 * consumed here once their env vars are set — see server.ts). No `readOnlyMode` is set on the
 * adapter below, so this is full read/write (retry/delete/re-queue, and — usefully for
 * `refresh-library-loans` — adding a job by hand to trigger an out-of-schedule run), not a
 * view-only board (#296).
 */
export async function registerBullBoard(app: FastifyInstance, queues: Queue[]): Promise<void> {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  await app.register(serverAdapter.registerPlugin(), {
    prefix: BULL_BOARD_BASE_PATH,
  });
}
