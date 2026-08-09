import { describe, expect, it } from "vitest";
import { isValidBasicAuth } from "./auth.js";

const EXPECTED = { username: "admin", password: "secret" };

function basicHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("isValidBasicAuth", () => {
  it("accepts matching credentials", () => {
    expect(isValidBasicAuth(basicHeader("admin", "secret"), EXPECTED)).toBe(true);
  });

  it("rejects a wrong username", () => {
    expect(isValidBasicAuth(basicHeader("someone-else", "secret"), EXPECTED)).toBe(false);
  });

  it("rejects a wrong password", () => {
    expect(isValidBasicAuth(basicHeader("admin", "wrong"), EXPECTED)).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isValidBasicAuth(undefined, EXPECTED)).toBe(false);
  });

  it("rejects a non-Basic scheme", () => {
    expect(isValidBasicAuth("Bearer sometoken", EXPECTED)).toBe(false);
  });

  it("rejects a header with no colon separator once decoded", () => {
    const header = `Basic ${Buffer.from("admin-secret-no-colon").toString("base64")}`;
    expect(isValidBasicAuth(header, EXPECTED)).toBe(false);
  });

  it("rejects garbled base64 without throwing", () => {
    expect(isValidBasicAuth("Basic %%%not-base64%%%", EXPECTED)).toBe(false);
  });

  it("rejects a username/password of a different length without throwing", () => {
    expect(isValidBasicAuth(basicHeader("a", "b"), EXPECTED)).toBe(false);
  });

  it("supports a password containing a colon", () => {
    const expected = { username: "admin", password: "pass:with:colons" };
    expect(isValidBasicAuth(basicHeader("admin", "pass:with:colons"), expected)).toBe(true);
  });
});
