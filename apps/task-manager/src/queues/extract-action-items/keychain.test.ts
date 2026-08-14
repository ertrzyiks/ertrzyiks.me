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

describe("resolveSecret", () => {
  const ENV_VAR = "TASK_MANAGER_TEST_SECRET";

  beforeEach(() => {
    delete process.env[ENV_VAR];
  });

  it("returns the env var without touching the reader when one is set", async () => {
    process.env[ENV_VAR] = "redis://env-value";
    const { resolveSecret } = await import("./keychain.js");
    const reader = { read: vi.fn() };

    const value = await resolveSecret(reader, "worker-account", "redis-url", ENV_VAR);

    expect(value).toBe("redis://env-value");
    expect(reader.read).not.toHaveBeenCalled();
  });

  it("falls back to the reader when the env var is unset", async () => {
    const { resolveSecret } = await import("./keychain.js");
    const reader = { read: vi.fn().mockResolvedValue("redis://keychain-value") };

    const value = await resolveSecret(reader, "worker-account", "redis-url", ENV_VAR);

    expect(value).toBe("redis://keychain-value");
    expect(reader.read).toHaveBeenCalledWith("worker-account", "redis-url");
  });

  it("falls back to the reader when the env var is an empty string", async () => {
    process.env[ENV_VAR] = "";
    const { resolveSecret } = await import("./keychain.js");
    const reader = { read: vi.fn().mockResolvedValue("redis://keychain-value") };

    const value = await resolveSecret(reader, "worker-account", "redis-url", ENV_VAR);

    expect(value).toBe("redis://keychain-value");
    expect(reader.read).toHaveBeenCalledWith("worker-account", "redis-url");
  });

  it("wraps a Keychain miss in a message naming both the item and the env var alternative", async () => {
    const { resolveSecret } = await import("./keychain.js");
    const keychainError = new Error(
      "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.",
    );
    const reader = { read: vi.fn().mockRejectedValue(keychainError) };

    const rejection = resolveSecret(reader, "worker-account", "redis-url", ENV_VAR);

    await expect(rejection).rejects.toThrow('"redis-url"');
    await expect(rejection).rejects.toThrow("worker-account");
    await expect(rejection).rejects.toThrow(ENV_VAR);
    await expect(rejection).rejects.toMatchObject({ cause: keychainError });
  });
});
