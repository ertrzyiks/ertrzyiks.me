// Config for the library sync workers started inside server.ts. Unlike worker.ts (Mac-only,
// secrets from the Keychain — see keychain.ts), these run on Dokku, so secrets come from plain
// env vars (Dokku config vars), the same convention server.ts and kstatus/personal-assistant's
// config.ts use. `redisUrl` here is somewhat redundant with server.ts's own separately-validated
// `REDIS_URL` read — kept for this type's own completeness/testability rather than threading an
// extra parameter through, but server.ts uses its own copy for the actual Redis connections.

/** One WBPG login the refresh job pulls loans from. The first one is the primary (required);
 * any further ones are optional extra cards — e.g. a partner's own library account, whose loans
 * land on the same calendar as the primary's (see libraryRefresh.ts). */
export interface LibraryAccountConfig {
  username: string;
  password: string;
  /** Owner name shown in the calendar event description for loans on *this login's own* card.
   * Loans on a linked sub-account already carry the name WBPG reports for that card, so this
   * only fills in the gap the login itself leaves. Undefined on a single-account setup, where
   * there is nobody to tell those loans apart from. */
  label?: string;
}

export interface LibraryWorkerConfig {
  redisUrl: string;
  databasePath: string;
  wbpg: {
    /** Shared by every account below — they're all cards in the same WBPG catalog. */
    baseUrl?: string;
    /** At least one; `accounts[0]` is the WBPG_USERNAME/WBPG_PASSWORD primary. */
    accounts: LibraryAccountConfig[];
  };
  googleCalendar: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    calendarId?: string;
    timeZone?: string;
  };
  /** Cron pattern for the refresh-library-loans repeatable job (BullMQ/node-cron syntax). */
  refreshCronPattern: string;
}

// Matches the storage mount this app's terraform config points at for this worker's sqlite file
// — see terraform/main.tf's dokku_app.task_manager `storage` block and README.md.
const DEFAULT_DATABASE_PATH = "/app/data/library.sqlite";
const DEFAULT_REFRESH_CRON_PATTERN = "0 7 * * *"; // daily, 07:00 Europe/Warsaw

export function loadLibraryWorkerConfig(env: NodeJS.ProcessEnv = process.env): LibraryWorkerConfig {
  function required(name: string): string {
    const value = env[name];
    if (!value) {
      throw new Error(`${name} is required (see apps/task-manager/README.md's library sync worker section)`);
    }
    return value;
  }

  // Both halves of the optional second card or neither — a username with no password would
  // otherwise silently skip that account, which on the calendar is indistinguishable from "the
  // second card has no loans right now".
  const secondaryUsername = env.WBPG_SECONDARY_USERNAME;
  const secondaryPassword = env.WBPG_SECONDARY_PASSWORD;
  if (Boolean(secondaryUsername) !== Boolean(secondaryPassword)) {
    throw new Error(
      "WBPG_SECONDARY_USERNAME and WBPG_SECONDARY_PASSWORD must be set together " +
        "(see apps/task-manager/README.md's library sync worker section)",
    );
  }

  const accounts: LibraryAccountConfig[] = [
    { username: required("WBPG_USERNAME"), password: required("WBPG_PASSWORD"), label: env.WBPG_LABEL },
  ];
  if (secondaryUsername && secondaryPassword) {
    accounts.push({
      username: secondaryUsername,
      password: secondaryPassword,
      label: env.WBPG_SECONDARY_LABEL,
    });
  }

  return {
    redisUrl: required("REDIS_URL"),
    databasePath: env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH,
    wbpg: {
      baseUrl: env.WBPG_BASE_URL,
      accounts,
    },
    googleCalendar: {
      clientId: required("GOOGLE_CALENDAR_CLIENT_ID"),
      clientSecret: required("GOOGLE_CALENDAR_CLIENT_SECRET"),
      refreshToken: required("GOOGLE_CALENDAR_REFRESH_TOKEN"),
      calendarId: env.GOOGLE_CALENDAR_ID,
      timeZone: env.GOOGLE_CALENDAR_TIMEZONE,
    },
    refreshCronPattern: env.LIBRARY_REFRESH_CRON_PATTERN ?? DEFAULT_REFRESH_CRON_PATTERN,
  };
}
