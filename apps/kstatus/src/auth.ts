import { timingSafeEqual } from "node:crypto";
import type { AdminBasicAuth } from "./config.js";

const BASIC_PREFIX = "Basic ";

function timingSafeStringEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual throws on a length mismatch, so a differing length is itself treated as
  // "invalid" up front rather than compared unsafely.
  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Validates an `Authorization: Basic <base64(user:pass)>` header against the configured
 * credentials. Both the username and password are compared with `timingSafeEqual` — and neither
 * comparison is skipped once the other has failed — so a wrong username can't be distinguished
 * from a wrong password by response timing.
 */
export function isValidBasicAuth(
  authorizationHeader: string | undefined,
  expected: AdminBasicAuth,
): boolean {
  if (!authorizationHeader?.startsWith(BASIC_PREFIX)) return false;

  // Buffer.from(..., "base64") is lenient rather than throwing on malformed input — it just
  // decodes as much as it can, so a garbled header simply fails the comparisons below.
  const decoded = Buffer.from(authorizationHeader.slice(BASIC_PREFIX.length), "base64").toString(
    "utf8",
  );

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const usernameMatches = timingSafeStringEqual(username, expected.username);
  const passwordMatches = timingSafeStringEqual(password, expected.password);

  return usernameMatches && passwordMatches;
}
