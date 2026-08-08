import { timingSafeEqual } from "node:crypto";

const BASIC_PREFIX = "Basic ";

// timingSafeEqual throws on a length mismatch, so a differing length is itself treated as
// "unequal" up front rather than compared unsafely.
function constantTimeStringEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Validates an `Authorization: Basic <base64(username:password)>` header — guards the
 * `/admin/status` snapshot dashboard (#297/#312), the only route on this service worth
 * protecting (see healthServer.ts; `/health` stays open for Dokku's proxy).
 */
export function isValidBasicAuth(
  authorizationHeader: string | undefined,
  expectedUsername: string,
  expectedPassword: string,
): boolean {
  if (!authorizationHeader?.startsWith(BASIC_PREFIX)) return false;

  const decoded = Buffer.from(authorizationHeader.slice(BASIC_PREFIX.length), "base64").toString(
    "utf8",
  );
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  const providedUsername = decoded.slice(0, separatorIndex);
  const providedPassword = decoded.slice(separatorIndex + 1);

  // Both halves are compared unconditionally (not short-circuited via `&&` on the calls
  // themselves) so a wrong username doesn't skip the password comparison — avoids leaking via
  // timing which half was wrong.
  const usernameMatches = constantTimeStringEqual(providedUsername, expectedUsername);
  const passwordMatches = constantTimeStringEqual(providedPassword, expectedPassword);

  return usernameMatches && passwordMatches;
}
