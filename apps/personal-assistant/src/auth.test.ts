import { describe, expect, it } from "vitest";
import { isValidBasicAuth } from "./auth.js";

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("isValidBasicAuth", () => {
  it("accepts matching username and password", () => {
    expect(isValidBasicAuth(basicAuthHeader("admin", "secret"), "admin", "secret")).toBe(true);
  });

  it("rejects a mismatched password", () => {
    expect(isValidBasicAuth(basicAuthHeader("admin", "wrong"), "admin", "secret")).toBe(false);
  });

  it("rejects a mismatched username", () => {
    expect(isValidBasicAuth(basicAuthHeader("wrong", "secret"), "admin", "secret")).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isValidBasicAuth(undefined, "admin", "secret")).toBe(false);
  });

  it("rejects a non-Basic scheme", () => {
    expect(isValidBasicAuth("Bearer secret", "admin", "secret")).toBe(false);
  });

  it("rejects a header with no ':' separator once decoded", () => {
    const header = `Basic ${Buffer.from("admin-secret").toString("base64")}`;
    expect(isValidBasicAuth(header, "admin", "secret")).toBe(false);
  });

  it("rejects credentials of a different length without throwing", () => {
    expect(
      isValidBasicAuth(basicAuthHeader("admin", "short"), "admin", "much-longer-secret"),
    ).toBe(false);
  });

  it("allows a password containing ':' (splits on the first ':' only)", () => {
    expect(isValidBasicAuth(basicAuthHeader("admin", "pass:word"), "admin", "pass:word")).toBe(
      true,
    );
  });
});
