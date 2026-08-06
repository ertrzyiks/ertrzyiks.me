import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHealthServer } from "./healthServer.js";
import type { Server } from "node:http";

describe("healthServer", () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function listen(): Promise<number> {
    server = createHealthServer();
    await new Promise<void>((resolve) => server?.listen(0, resolve));
    return (server?.address() as AddressInfo).port;
  }

  it("responds 200 with a status body on GET /health", async () => {
    const port = await listen();

    const res = await fetch(`http://localhost:${port}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("responds 404 for any other path", async () => {
    const port = await listen();

    const res = await fetch(`http://localhost:${port}/other`);

    expect(res.status).toBe(404);
  });
});
