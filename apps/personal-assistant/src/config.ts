export interface Config {
  gmail: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    maxResults: number;
  };
  jobsApi: {
    baseUrl: string;
    bearerToken: string;
  };
  databasePath: string;
  pollIntervalMs: number;
  dashboardBasicAuth: {
    username: string;
    password: string;
  };
  /** Trend-event emission to Axiom (#315) — null when either var is unset, same optional-at-
   * startup treatment as task-manager's Todoist/library sync credentials: this service
   * runs the same either way, events are just a no-op until both are provisioned. */
  axiom: {
    token: string;
    dataset: string;
  } | null;
  /** Sentry DSN for error monitoring (see sentry.ts) — undefined disables it, same optional-at-
   * startup treatment as `axiom` above; unlike `axiom` this is a single value, not a pair. */
  sentryDsn: string | undefined;
}

// Matches the storage mount configured in terraform/main.tf's dokku_app.personal_assistant
// (`storage.personal-assistant.mount_path = "/app/data"`).
const DEFAULT_DATABASE_PATH = "/app/data/personal-assistant.sqlite";
const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_GMAIL_MAX_RESULTS = 50;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const axiomToken = env.AXIOM_TOKEN;
  const axiomDataset = env.AXIOM_DATASET;

  return {
    gmail: {
      clientId: required(env, "GMAIL_CLIENT_ID"),
      clientSecret: required(env, "GMAIL_CLIENT_SECRET"),
      refreshToken: required(env, "GMAIL_REFRESH_TOKEN"),
      maxResults: Number(env.GMAIL_MAX_RESULTS ?? DEFAULT_GMAIL_MAX_RESULTS),
    },
    jobsApi: {
      baseUrl: required(env, "JOBS_API_BASE_URL"),
      bearerToken: required(env, "JOBS_API_BEARER_TOKEN"),
    },
    databasePath: env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH,
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS),
    // Required (not optional, unlike task-manager's Bull Board Basic Auth vars, #296) — the
    // snapshot dashboard (#297/#312) is the only non-liveness route this service exposes, so
    // there's no low-friction local-dev case worth degrading safety for.
    dashboardBasicAuth: {
      username: required(env, "PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_USERNAME"),
      password: required(env, "PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_PASSWORD"),
    },
    axiom: axiomToken && axiomDataset ? { token: axiomToken, dataset: axiomDataset } : null,
    sentryDsn: env.SENTRY_DSN,
  };
}
