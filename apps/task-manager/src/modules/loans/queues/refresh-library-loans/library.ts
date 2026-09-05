// WBPG library catalog (https://katalog.wbpg.org.pl/, a MOL "Solar" OPAC) client. Logs in with
// a login/password, captures the session cookie the OPAC issues, and walks every account linked
// to that login (the login itself, plus any linked sub-accounts, e.g. a child's card) to collect
// their current loans.
//
// There is no public API for this product. Every endpoint/payload shape here was found by
// grepping the OPAC's own Angular bundle for "/api/" and confirmed against the real server —
// see scripts/wbpg-library-spike/ for how that discovery happened and what's verified.
export interface LibraryLoan {
  holdingId: number;
  title: string;
  author: string;
  filiaId: number;
  /** Naive local "YYYY-MM-DDTHH:mm:ss" — the OPAC always sends midnight (00:00:00) here in
   * practice, i.e. this only really carries a date, not a time. */
  dateReturn: string;
  /** null when this loan is on the login's own account, not a linked sub-account. */
  accountKey: string | null;
  /** The sub-account's display name (e.g. a child's), null for the login's own account. */
  accountLabel: string | null;
}

export interface LibraryClient {
  /** Every currently active loan across the login and all its linked sub-accounts. */
  getCurrentLoans(): Promise<LibraryLoan[]>;
  /** Branch ("filia") id -> human-readable name, e.g. 143 -> "Filia nr 001 Biblioteka
   * Manhattan". `GET /api/setting/all` is public config, not cookie-authenticated — this can be
   * called independently of getCurrentLoans()/before login. */
  getFiliaNames(): Promise<Map<number, string>>;
}

export interface LibraryClientConfig {
  baseUrl?: string;
  username: string;
  password: string;
  // Test seam — a fake `fetch` swapped in so request/response shapes can be asserted without a
  // real WBPG server (mirrors openRouter.ts's OpenRouterConfig.fetchImpl).
  fetchImpl?: typeof fetch;
}

interface LoanApiRecord {
  holdingId: number;
  title: string;
  author: string;
  filiaId: number;
  dateReturn: string;
}

interface LoanListResponse {
  success: boolean;
  total: number;
  loanLst: LoanApiRecord[];
}

interface SubuserRecord {
  key: string;
  username: string;
  fullName: string;
}

interface SubusersResponse {
  success: boolean;
  data: SubuserRecord[];
}

interface FiliaRecord {
  id: number;
  name: string;
}

interface SettingsResponse {
  filia: FiliaRecord[];
}

interface ApiEnvelope {
  success?: boolean;
  i18nMsg?: { key?: string };
}

const DEFAULT_BASE_URL = "https://katalog.wbpg.org.pl";
// The loan lists this client is meant for are a personal library account's current loans, never
// going to run into four figures — one page is always enough in practice. Still loops on `total`
// rather than assuming that, so a page boundary can't silently drop loans.
const LOAN_PAGE_SIZE = 100;

export function createLibraryClient(config: LibraryClientConfig): LibraryClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  // Minimal cookie jar: the OPAC issues an anonymous SESSION cookie on the first request and
  // upgrades that *same* cookie to an authenticated one on a successful login — it's not a fresh
  // token, so every request has to keep sending whatever the most recent Set-Cookie handed back.
  const jar = new Map<string, string>();

  function storeCookies(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  function cookieHeader(): string {
    return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const cookie = cookieHeader();
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      // Confirmed against the real server: Cookie is the only header any of these endpoints
      // actually needs — see scripts/wbpg-library-spike/README.md.
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    storeCookies(res);

    const json = (await res.json().catch(() => null)) as (T & ApiEnvelope) | null;

    // The app signals its own failures with `success: false` in an otherwise-200 (or 401/403)
    // JSON body rather than always using the HTTP status alone (e.g. bad credentials, or an
    // endpoint called out of the sequence it expects — see the userinfo note below).
    if (!res.ok || json?.success === false) {
      const reason = json?.i18nMsg?.key ? ` (${json.i18nMsg.key})` : "";
      throw new Error(`WBPG ${method} ${path} failed: ${res.status} ${res.statusText}${reason}`);
    }

    return json as T;
  }

  async function login(): Promise<void> {
    await request("POST", "/api/login", { username: config.username, password: config.password });
    // Must run right after login, before any other authenticated endpoint. Confirmed against the
    // real server: some endpoints (e.g. /api/auth/user/subusers) 403 without this call having run
    // first, even with a valid session cookie — see scripts/wbpg-library-spike/README.md. Looks
    // like it seeds some auth/permission state into the session as a side effect, not just a
    // data fetch, so this isn't optional even though the response itself is unused here.
    await request("POST", "/api/auth/userinfo", { chromePwa: false });
  }

  async function fetchAllLoans(): Promise<LoanApiRecord[]> {
    const loans: LoanApiRecord[] = [];
    for (;;) {
      const page = await request<LoanListResponse>("POST", "/api/auth/loan", {
        start: loans.length,
        count: LOAN_PAGE_SIZE,
        status: null,
      });
      loans.push(...page.loanLst);
      if (loans.length >= page.total || page.loanLst.length === 0) break;
    }
    return loans;
  }

  function toLibraryLoan(
    record: LoanApiRecord,
    accountKey: string | null,
    accountLabel: string | null,
  ): LibraryLoan {
    return {
      holdingId: record.holdingId,
      title: record.title,
      author: record.author,
      filiaId: record.filiaId,
      dateReturn: record.dateReturn,
      accountKey,
      accountLabel,
    };
  }

  return {
    async getCurrentLoans() {
      await login();

      const loans = (await fetchAllLoans()).map((record) => toLibraryLoan(record, null, null));

      const subusers = await request<SubusersResponse>("GET", "/api/auth/user/subusers");
      for (const subuser of subusers.data) {
        await request("POST", "/api/auth/user/change", { key: subuser.key });
        const subLoans = await fetchAllLoans();
        loans.push(...subLoans.map((record) => toLibraryLoan(record, subuser.key, subuser.fullName)));
      }

      return loans;
    },

    async getFiliaNames() {
      const settings = await request<SettingsResponse>("GET", "/api/setting/all");
      return new Map(settings.filia.map((filia) => [filia.id, filia.name]));
    },
  };
}
