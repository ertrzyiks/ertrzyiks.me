import { describe, expect, it } from "vitest";
import { isValidBearerToken } from "./auth.js";

describe("isValidBearerToken", () => {
  it("accepts a matching bearer token", () => {
    expect(isValidBearerToken("Bearer secret", "secret")).toBe(true);
  });

  it("rejects a mismatched token", () => {
    expect(isValidBearerToken("Bearer wrong", "secret")).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isValidBearerToken(undefined, "secret")).toBe(false);
  });

  it("rejects a non-Bearer scheme", () => {
    expect(isValidBearerToken("Basic secret", "secret")).toBe(false);
  });

  it("rejects a token of a different length without throwing", () => {
    expect(isValidBearerToken("Bearer short", "much-longer-secret")).toBe(false);
  });
});
