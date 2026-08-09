#!/usr/bin/env node
// One-command release for the Mac worker (#251, follow-up to the pkg-based bundling
// discussed on the PR that introduced this file): build -> bundle -> package into a
// standalone executable -> (re-)provision its Keychain secrets -> restart the
// LaunchAgent so it picks up the new binary.
//
// Run via `pnpm --filter task-manager release:worker` from the repo root, or
// `node scripts/release-worker.mjs` from apps/task-manager directly — either way this
// file's relative paths assume cwd is apps/task-manager (pnpm sets that automatically
// for package scripts).
//
// WHY A STANDALONE BINARY AT ALL: `worker.ts` used to run as `node dist/worker.js`,
// with the LaunchAgent's Keychain access grant (`-T`) pointing at the shared `node`
// binary. That grants trust to *every* script anyone ever runs with that same node
// interpreter, not just this one — see the PR discussion this script was introduced
// in. Packaging the worker into its own executable via esbuild + @yao-pkg/pkg gives
// it a distinct binary identity so the Keychain `-T` grant can be scoped to it alone.
//
// THE TRADE-OFF: without a paid Apple Developer ID certificate, an unsigned/ad-hoc
// -signed binary's Keychain trust is computed largely from its file hash. Every
// rebuild changes that hash, so the old `-T` grant stops applying — this script
// re-provisions (deletes + recreates) every secret's Keychain item on every run to
// keep the grant current. That's a deliberate, recurring cost of this approach, not
// a bug: see the PR discussion for why it was accepted anyway.
//
// macOS-only from the `codesign`/`security`/`launchctl` step onward. Developed and
// smoke-tested (build + bundle + cross-target `pkg` packaging only) in this repo's
// Linux sandbox, where those three tools don't exist — this script detects that and
// skips the macOS-only steps with a warning rather than failing, but the Keychain
// provisioning and LaunchAgent reload paths have never actually run for real. See the
// PR that introduced this file for what was and wasn't verified end-to-end.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { parse as parseDotenv } from "dotenv";

const LAUNCH_AGENT_LABEL = "com.ertrzyiks.task-manager-worker";
const KEYCHAIN_SERVICE = "task-manager-worker";
const BUNDLE_PATH = "dist-bin/worker.bundle.cjs";
const BINARY_PATH = "dist-bin/task-manager-worker";
// lmStudio.ts reads its system prompt from src/prompts/ via a path resolved relative
// to its own file at runtime (import.meta.url). That resolution lands here once
// bundled, so the prompts have to physically exist next to the bundle too — copied
// by runBundle() below, and declared as a pkg "assets" glob (see package.json) so
// @yao-pkg/pkg embeds them in the standalone executable rather than leaving them as
// a loose file the binary can't find once it's moved off this machine.
const PROMPTS_SRC_DIR = "src/prompts";
const PROMPTS_DIST_DIR = "dist-bin/prompts";

// Maps each Keychain "account" (see keychain.ts / worker.ts) to the key it's read
// from in the local secrets file. Keep this in sync with worker.ts's Keychain reads.
const SECRETS = [
  { account: "gmail-refresh-token", secretsFileKey: "GMAIL_REFRESH_TOKEN" },
  { account: "redis-url", secretsFileKey: "REDIS_URL" },
  { account: "gmail-client-id", secretsFileKey: "GMAIL_CLIENT_ID" },
  { account: "gmail-client-secret", secretsFileKey: "GMAIL_CLIENT_SECRET" },
];

// Deliberately outside the repo checkout (never gitignored-but-present, genuinely not
// in any git working tree) — this file only ever feeds `security add-generic-password`
// in this script; the worker itself never reads it, only the Keychain (see worker.ts).
// Override with TASK_MANAGER_SECRETS_FILE if you keep it somewhere else.
const secretsFilePath =
  process.env.TASK_MANAGER_SECRETS_FILE ?? join(homedir(), ".task-manager", "secrets.env");

function log(step, message) {
  console.log(`[release-worker] ${step}: ${message}`);
}

function readSecretsFile() {
  if (!existsSync(secretsFilePath)) {
    throw new Error(
      `Secrets file not found at ${secretsFilePath}. Create it with one KEY=value line per ` +
        `entry in SECRETS (${SECRETS.map((s) => s.secretsFileKey).join(", ")}), chmod 600 it, ` +
        `and re-run — see the "Provisioning secrets" section of README.md.`,
    );
  }
  const parsed = parseDotenv(readFileSync(secretsFilePath, "utf8"));
  const missing = SECRETS.map((s) => s.secretsFileKey).filter((key) => !parsed[key]);
  if (missing.length > 0) {
    throw new Error(`Secrets file ${secretsFilePath} is missing: ${missing.join(", ")}`);
  }
  return parsed;
}

function runBuild() {
  log("build", "tsc (pnpm --filter task-manager build)");
  execFileSync("node_modules/.bin/tsc", [], { stdio: "inherit" });
}

async function runBundle() {
  log("bundle", `esbuild src/worker.ts -> ${BUNDLE_PATH}`);
  mkdirSync("dist-bin", { recursive: true });
  await esbuild.build({
    entryPoints: ["src/worker.ts"],
    outfile: BUNDLE_PATH,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    logLevel: "warning",
  });

  // esbuild only bundles statically-imported JS/TS — lmStudio.ts's system prompt is
  // read at runtime via fs, so it has to be copied alongside the bundle by hand.
  log("bundle", `copying ${PROMPTS_SRC_DIR} -> ${PROMPTS_DIST_DIR}`);
  cpSync(PROMPTS_SRC_DIR, PROMPTS_DIST_DIR, { recursive: true });
}

function currentPkgTarget() {
  // Self-targeting: this script is meant to be run on the Mac the worker will
  // actually run on. `process.arch` here is the arch of whatever's running this
  // script, which on a real release is that same Mac.
  //
  // Pinned to node22 (this repo's own Node major, see .nvmrc/package.json engines if
  // present) rather than a newer LTS: @yao-pkg/pkg-fetch only ships prebuilt binaries
  // for Node majors it actively caches, and that list drops old ones over time as
  // they go EOL — node20 aged out of the cache entirely by the time this script was
  // written, forcing an uncachable from-source build pkg can't cross-compile for
  // macOS from anywhere but macOS itself. If this ever starts failing with a similar
  // "404: Not Found in remote cache" error, check https://github.com/yao-pkg/pkg-fetch
  // for which Node majors are currently cached and bump this.
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `node22-macos-${arch}`;
}

function runPackage() {
  const target = currentPkgTarget();
  log("package", `@yao-pkg/pkg ${BUNDLE_PATH} --targets ${target} -> ${BINARY_PATH}`);
  // --config is required here: pkg only auto-discovers package.json's "pkg" field
  // (the source of the "assets" glob that embeds dist-bin/prompts/, see above) when
  // given "." as the entry to follow its "bin" field. Given an explicit entry file
  // like BUNDLE_PATH instead, it silently skips that config unless told where to
  // find it — verified by hand; the prompt file is missing from the packaged binary
  // without this flag, with no build-time warning.
  execFileSync(
    "node_modules/.bin/pkg",
    [BUNDLE_PATH, "--targets", target, "--output", BINARY_PATH, "--config", "package.json"],
    { stdio: "inherit" },
  );
}

function runCodesign() {
  if (process.platform !== "darwin") {
    log("codesign", "skipped (not macOS)");
    return;
  }
  log("codesign", `ad-hoc signing ${BINARY_PATH}`);
  // Ad-hoc (`-s -`, no Developer ID) — keeps Gatekeeper quiet locally, but does NOT
  // give a stable cross-rebuild identity (see this file's header comment on why
  // every rebuild still needs a fresh Keychain -T grant regardless).
  execFileSync("codesign", ["--force", "--sign", "-", BINARY_PATH], { stdio: "inherit" });
}

function provisionKeychain(secrets) {
  if (process.platform !== "darwin") {
    log("keychain", "skipped (not macOS, no `security` CLI)");
    return;
  }
  const binaryPath = join(process.cwd(), BINARY_PATH);
  for (const { account, secretsFileKey } of SECRETS) {
    log("keychain", `(re-)provisioning "${account}", trusting ${binaryPath}`);
    // -U: update in place if the item already exists, equivalent to delete-then-add —
    // this is what actually refreshes the ACL to trust the newly built binary.
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-U",
        "-a",
        account,
        "-s",
        KEYCHAIN_SERVICE,
        "-w",
        secrets[secretsFileKey],
        "-T",
        binaryPath,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
  }
}

function reloadLaunchAgent() {
  if (process.platform !== "darwin") {
    log("launchd", "skipped (not macOS, no `launchctl` CLI)");
    return;
  }
  const target = `gui/${process.getuid()}/${LAUNCH_AGENT_LABEL}`;
  // `launchctl print` exits non-zero (throwing here) if the agent isn't bootstrapped
  // yet — main() catches that and treats it as "first-time install, nothing to
  // restart" rather than a release failure.
  execFileSync("launchctl", ["print", target], { stdio: ["ignore", "ignore", "ignore"] });
  log("launchd", `restarting ${target}`);
  execFileSync("launchctl", ["kickstart", "-k", target], { stdio: "inherit" });
}

async function main() {
  runBuild();
  await runBundle();
  runPackage();
  runCodesign();

  const secrets = readSecretsFile();
  provisionKeychain(secrets);

  try {
    reloadLaunchAgent();
  } catch {
    log(
      "launchd",
      `${LAUNCH_AGENT_LABEL} isn't loaded yet — skipping restart. First-time install? ` +
        `See the "macOS LaunchAgent" section of README.md.`,
    );
  }

  log("done", `${BINARY_PATH} built and (on macOS) Keychain items + LaunchAgent refreshed.`);
}

main().catch((error) => {
  console.error(`[release-worker] failed: ${error.message}`);
  process.exit(1);
});
