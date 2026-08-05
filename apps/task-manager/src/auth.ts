import { timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = "Bearer ";

export function isValidBearerToken(
  authorizationHeader: string | undefined,
  expectedToken: string,
): boolean {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) return false;

  const provided = Buffer.from(authorizationHeader.slice(BEARER_PREFIX.length));
  const expected = Buffer.from(expectedToken);

  // timingSafeEqual throws on a length mismatch, so a differing length is
  // itself treated as "invalid" up front rather than compared unsafely.
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}
