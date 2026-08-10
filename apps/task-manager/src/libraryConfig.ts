// Config for the library sync workers started inside server.ts. Unlike worker.ts (Mac-only,
// secrets from the Keychain — see keychain.ts), these run on Dokku, so secrets come from plain
// env vars (Dokku config vars), the same convention server.ts and kstatus/personal-assistant's
// config.ts use. `redisUrl` here is somewhat redundant with server.ts's own separately-validated
// `REDIS_URL` read — kept for this type's own completeness/testability rather than threading an
// extra parameter through, but server.ts uses its own copy for the actual Redis connections.
export interface LibraryWorkerConfig {
  redisUrl: string;
  databasePath: string;
  wbpg: {
    baseUrl?: string;
    username: string;
    password: string;
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

  return {
    redisUrl: required("REDIS_URL"),
    databasePath: env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH,
    wbpg: {
      baseUrl: env.WBPG_BASE_URL,
      username: required("WBPG_USERNAME"),
      password: required("WBPG_PASSWORD"),
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
