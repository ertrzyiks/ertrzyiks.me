import { timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = "Bearer ";
const BASIC_PREFIX = "Basic ";

// timingSafeEqual throws on a length mismatch, so a differing length is itself treated as
// "unequal" up front rather than compared unsafely. Shared by both auth schemes below.
function constantTimeStringEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}

export function isValidBearerToken(
  authorizationHeader: string | undefined,
  expectedToken: string,
): boolean {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) return false;

  return constantTimeStringEqual(authorizationHeader.slice(BEARER_PREFIX.length), expectedToken);
}

/**
 * Validates an `Authorization: Basic <base64(username:password)>` header — a separate scheme
 * from `isValidBearerToken`'s, used to guard Bull Board (#296/#311) since it needs to be
 * reachable from a plain browser tab, which can't attach a Bearer token the way an API client can.
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
