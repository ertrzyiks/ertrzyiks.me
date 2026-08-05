import { describe, expect, it, vi, beforeEach } from "vitest";

const execFileMock = vi.fn();

// The `security` CLI only exists on macOS — this repo's CI and sandbox are Linux,
// so the real keychain read is unverifiable here (see keychain.ts's header comment).
// This test only pins down that we shell out with the right arguments and parse
// stdout correctly; it can't prove the real macOS binary behaves this way.
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

beforeEach(() => {
  execFileMock.mockReset();
});

describe("macKeychainReader", () => {
  it("shells out to `security find-generic-password` with the given account/service", async () => {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        callback: (error: unknown, result: { stdout: string; stderr: string }) => void,
      ) => {
        callback(null, { stdout: "refresh-token-value\n", stderr: "" });
      },
    );

    const { macKeychainReader } = await import("./keychain.js");
    const token = await macKeychainReader.read("worker-account", "gmail-refresh-token");

    expect(token).toBe("refresh-token-value");
    expect(execFileMock).toHaveBeenCalledWith(
      "security",
      ["find-generic-password", "-a", "worker-account", "-s", "gmail-refresh-token", "-w"],
      expect.any(Function),
    );
  });

  it("propagates an error when the keychain read fails", async () => {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        callback: (error: unknown, result: { stdout: string; stderr: string }) => void,
      ) => {
        callback(new Error("security: item not found"), { stdout: "", stderr: "not found" });
      },
    );

    const { macKeychainReader } = await import("./keychain.js");

    await expect(macKeychainReader.read("worker-account", "gmail-refresh-token")).rejects.toThrow(
      "security: item not found",
    );
  });
});
