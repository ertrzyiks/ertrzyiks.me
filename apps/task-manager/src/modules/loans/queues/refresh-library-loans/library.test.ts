import { describe, expect, it, vi } from "vitest";
import { createLibraryClient } from "./library.js";

// The WBPG catalog is a real remote server — nothing to talk to in CI/sandbox, so every test
// here injects a fake `fetch` via the `fetchImpl` seam rather than making a real HTTP call
// (mirrors openRouter.test.ts).

function jsonResponse(body: unknown, status = 200, setCookie: string[] = []): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    headers: { getSetCookie: () => setCookie } as unknown as Headers,
  } as Response;
}

function loan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    holdingId: 1,
    title: "Michał i 38",
    author: "Witek, Rafał (1971- ).",
    filiaId: 144,
    dateReturn: "2026-08-20T00:00:00",
    ...overrides,
  };
}

describe("createLibraryClient", () => {
  it("logs in, fetches userinfo, then the login's own loans, tagging them with a null account", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("https://katalog.wbpg.org.pl", "");
      calls.push(`${init?.method ?? "GET"} ${path}`);

      if (path === "/api/login") return jsonResponse({ success: true });
      if (path === "/api/auth/userinfo") return jsonResponse({ success: true });
      if (path === "/api/auth/loan") return jsonResponse({ success: true, start: 0, total: 1, loanLst: [loan()] });
      if (path === "/api/auth/user/subusers") return jsonResponse({ success: true, data: [] });
      throw new Error(`Unexpected URL: ${path}`);
    });

    const client = createLibraryClient({ username: "user", password: "pass", fetchImpl: fetchImpl as unknown as typeof fetch });
    const loans = await client.getCurrentLoans();

    expect(loans).toEqual([
      {
        holdingId: 1,
        title: "Michał i 38",
        author: "Witek, Rafał (1971- ).",
        filiaId: 144,
        dateReturn: "2026-08-20T00:00:00",
        accountKey: null,
        accountLabel: null,
      },
    ]);

    // Order matters: userinfo has to run right after login and before anything else — an
    // earlier version of this client 403'd on /api/auth/user/subusers without it (see
    // scripts/wbpg-library-spike/README.md).
    expect(calls).toEqual([
      "POST /api/login",
      "POST /api/auth/userinfo",
      "POST /api/auth/loan",
      "GET /api/auth/user/subusers",
    ]);
  });

  it("switches into each linked sub-account and tags their loans with its key and name", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("https://katalog.wbpg.org.pl", "");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (path === "/api/login") return jsonResponse({ success: true });
      if (path === "/api/auth/userinfo") return jsonResponse({ success: true });
      if (path === "/api/auth/user/subusers") {
        return jsonResponse({ success: true, data: [{ key: "sub-1", username: "jakub", fullName: "Jakub Derks" }] });
      }
      if (path === "/api/auth/user/change") {
        expect(body).toEqual({ key: "sub-1" });
        return jsonResponse({ success: true });
      }
      if (path === "/api/auth/loan") {
        return jsonResponse({ success: true, start: 0, total: 1, loanLst: [loan({ holdingId: 2, title: "Tsatsiki i Retzina" })] });
      }
      throw new Error(`Unexpected URL: ${path}`);
    });

    const client = createLibraryClient({ username: "user", password: "pass", fetchImpl: fetchImpl as unknown as typeof fetch });
    const loans = await client.getCurrentLoans();

    expect(loans).toEqual([
      expect.objectContaining({ holdingId: 2, title: "Tsatsiki i Retzina", accountKey: null, accountLabel: null }),
      expect.objectContaining({ holdingId: 2, title: "Tsatsiki i Retzina", accountKey: "sub-1", accountLabel: "Jakub Derks" }),
    ]);
  });

  it("pages through /api/auth/loan using start/count until total is reached", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("https://katalog.wbpg.org.pl", "");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (path === "/api/login") return jsonResponse({ success: true });
      if (path === "/api/auth/userinfo") return jsonResponse({ success: true });
      if (path === "/api/auth/user/subusers") return jsonResponse({ success: true, data: [] });
      if (path === "/api/auth/loan") {
        if (body.start === 0) {
          return jsonResponse({ success: true, start: 0, total: 3, loanLst: [loan({ holdingId: 1 }), loan({ holdingId: 2 })] });
        }
        expect(body.start).toBe(2);
        return jsonResponse({ success: true, start: 2, total: 3, loanLst: [loan({ holdingId: 3 })] });
      }
      throw new Error(`Unexpected URL: ${path}`);
    });

    const client = createLibraryClient({ username: "user", password: "pass", fetchImpl: fetchImpl as unknown as typeof fetch });
    const loans = await client.getCurrentLoans();

    expect(loans.map((l) => l.holdingId)).toEqual([1, 2, 3]);
  });

  it("throws with the server's i18nMsg key when login fails", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: false, i18nMsg: { key: "bad_credencials" } }, 401),
    );

    const client = createLibraryClient({ username: "user", password: "wrong", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.getCurrentLoans()).rejects.toThrow("bad_credencials");
  });

  it("sends the Set-Cookie value it received back on every subsequent request", async () => {
    const cookiesSent: (string | undefined)[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("https://katalog.wbpg.org.pl", "");
      cookiesSent.push((init?.headers as Record<string, string> | undefined)?.Cookie);

      if (path === "/api/login") return jsonResponse({ success: true }, 200, ["SESSION=abc123; Path=/; HttpOnly"]);
      if (path === "/api/auth/userinfo") return jsonResponse({ success: true });
      if (path === "/api/auth/loan") return jsonResponse({ success: true, start: 0, total: 0, loanLst: [] });
      if (path === "/api/auth/user/subusers") return jsonResponse({ success: true, data: [] });
      throw new Error(`Unexpected URL: ${path}`);
    });

    const client = createLibraryClient({ username: "user", password: "pass", fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.getCurrentLoans();

    expect(cookiesSent[0]).toBeUndefined(); // the login request itself has nothing to send yet
    expect(cookiesSent.slice(1)).toEqual(cookiesSent.slice(1).map(() => "SESSION=abc123"));
  });

  it("getFiliaNames maps the public /api/setting/all branch list by id, without logging in", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const path = String(url).replace("https://katalog.wbpg.org.pl", "");
      expect(path).toBe("/api/setting/all");
      return jsonResponse({
        filia: [
          { id: 143, name: "Filia nr 001 Biblioteka Manhattan" },
          { id: 144, name: "Filia nr 002 Biblioteka Oliwska" },
        ],
      });
    });

    const client = createLibraryClient({ username: "user", password: "pass", fetchImpl: fetchImpl as unknown as typeof fetch });
    const names = await client.getFiliaNames();

    expect(names.get(143)).toBe("Filia nr 001 Biblioteka Manhattan");
    expect(names.get(144)).toBe("Filia nr 002 Biblioteka Oliwska");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
