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
  };
}
