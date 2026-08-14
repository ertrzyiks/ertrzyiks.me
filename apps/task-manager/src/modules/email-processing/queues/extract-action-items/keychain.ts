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

// Reads a secret preferring an explicit env var override over the Keychain, so local
// dev/CI (no Keychain, e.g. this repo's Linux sandbox) can keep passing REDIS_URL/
// GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET as plain env vars (see README "Running the worker
// locally") while the production LaunchAgent — which sets none of them — falls through
// to the Keychain item provisioned by scripts/release-worker.mjs.
//
// Takes the env var's *name* (not its value) rather than a plain `string | undefined`
// override so that a Keychain miss can name the env var as an alternative in its error
// — otherwise a fresh install with neither the env var nor the Keychain item provisioned
// yet fails with only `security`'s raw, easy-to-miss "item could not be found" message.
export async function resolveSecret(
  reader: KeychainReader,
  account: string,
  service: string,
  envVarName: string,
): Promise<string> {
  const envValue = process.env[envVarName];
  if (envValue) return envValue;
  try {
    return await reader.read(account, service);
  } catch (cause) {
    throw new Error(
      `Could not read "${service}" from the macOS Keychain (account "${account}"), and no ` +
        `${envVarName} env var is set either. Provision the Keychain item — see the "macOS ` +
        `LaunchAgent" section of README.md / scripts/release-worker.mjs — or set ${envVarName} ` +
        `directly for local/dev use.`,
      { cause },
    );
  }
}
