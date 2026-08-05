// Reads the Gmail refresh token from the macOS Keychain at worker startup (#236).
// This worker only ever runs on the user's Mac, so shelling out to the `security`
// CLI is the only way to reach it from Node — there is no cross-platform API.
//
// macOS-only, unverified in CI/sandbox: this repo's CI and the sandbox this was
// developed in are both Linux, where `security` does not exist, so the real
// keychain read path has never actually executed end-to-end. `KeychainReader` is
// the seam that lets the rest of the worker (and its tests) stay independent of
// that fact — tests inject a fake reader instead of shelling out.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface KeychainReader {
  read(account: string, service: string): Promise<string>;
}

export const macKeychainReader: KeychainReader = {
  async read(account: string, service: string): Promise<string> {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-a",
      account,
      "-s",
      service,
      "-w",
    ]);
    return stdout.trim();
  },
};
